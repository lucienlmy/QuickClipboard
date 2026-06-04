use std::cmp;
use std::path::Path;
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};

use reqwest::{Client, Method, StatusCode};
use serde::de::DeserializeOwned;
use serde::Serialize;
use tokio::io::{AsyncRead, AsyncWriteExt};

use super::crypto::{self, WebdavCryptoContext};
use super::types::{SyncCollection, WebdavConfig};

const WEBDAV_FILE_UPLOAD_BUFFER_SIZE: usize = 256 * 1024;
pub type WebdavUploadProgressCallback = Arc<dyn Fn(u64) + Send + Sync + 'static>;

#[derive(Clone)]
pub struct WebdavClient {
    client: Client,
    config: WebdavConfig,
    base_url: String,
    crypto: Option<WebdavCryptoContext>,
}

impl WebdavClient {
    pub fn new(config: WebdavConfig) -> Result<Self, String> {
        let url = config.url.trim().trim_end_matches('/').to_string();
        if url.is_empty() {
            return Err("WebDAV 地址不能为空".to_string());
        }
        let root = normalize_path(&config.root_path);
        let base_url = if root.is_empty() {
            url.clone()
        } else {
            format!("{}/{}", url, root)
        };
        Ok(Self {
            client: Client::new(),
            config,
            base_url,
            crypto: None,
        })
    }

    pub async fn enable_encryption(&mut self, password: &str) -> Result<(), String> {
        self.mkcol("").await?;
        let config = match self.get_plain_json::<crypto::WebdavE2eeConfig>(crypto::CONFIG_PATH).await? {
            Some(config) => config,
            None => {
                let config = crypto::create_config();
                self.put_plain_json(crypto::CONFIG_PATH, &config).await?;
                config
            }
        };
        self.crypto = Some(crypto::context_for_config(
            &self.encryption_scope(),
            &config,
            password,
        )?);
        Ok(())
    }

    pub async fn test_connection(&self) -> Result<(), String> {
        self.mkcol("").await?;
        self.mkcol("history").await?;
        self.mkcol("history/chunks").await?;
        self.mkcol("favorites").await?;
        self.mkcol("favorites/chunks").await?;
        self.mkcol("groups").await?;
        self.mkcol("files").await?;
        self.mkcol("tombstones").await?;
        Ok(())
    }

    pub async fn ensure_collection_dirs(&self, collection: SyncCollection) -> Result<(), String> {
        self.mkcol("").await?;
        self.mkcol(collection.dir()).await?;
        self.mkcol(&format!("{}/chunks", collection.dir())).await
    }

    pub async fn ensure_groups_dir(&self) -> Result<(), String> {
        self.mkcol("").await?;
        self.mkcol("groups").await
    }

    pub async fn ensure_files_dir(&self) -> Result<(), String> {
        self.mkcol("").await?;
        self.mkcol("files").await
    }

    pub async fn ensure_cloud_files_dir(&self) -> Result<(), String> {
        self.mkcol("").await?;
        self.mkcol("cloud_files").await?;
        self.mkcol("cloud_files/objects").await
    }

    pub async fn ensure_tombstones_dir(&self) -> Result<(), String> {
        self.mkcol("").await?;
        self.mkcol("tombstones").await
    }

    pub async fn get_json<T: DeserializeOwned>(&self, path: &str) -> Result<Option<T>, String> {
        let Some(bytes) = self.get_bytes(path).await? else {
            return Ok(None);
        };
        let value = serde_json::from_slice(&bytes).map_err(|e| format!("解析 WebDAV JSON 失败: {}", e))?;
        Ok(Some(value))
    }

    pub async fn put_json<T: Serialize + ?Sized>(&self, path: &str, value: &T) -> Result<(), String> {
        let body = serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?;
        self.put_bytes(path, body).await
    }

    pub async fn get_bytes(&self, path: &str) -> Result<Option<Vec<u8>>, String> {
        let Some(bytes) = self.get_raw_bytes(path).await? else {
            return Ok(None);
        };
        match self.crypto.as_ref() {
            Some(crypto) => Ok(Some(crypto.decrypt_bytes(&normalize_path(path), &bytes)?)),
            None => Ok(Some(bytes)),
        }
    }

    pub async fn put_bytes(&self, path: &str, bytes: Vec<u8>) -> Result<(), String> {
        let bytes = match self.crypto.as_ref() {
            Some(crypto) => crypto.encrypt_bytes(&normalize_path(path), &bytes)?,
            None => bytes,
        };
        self.put_raw_bytes(path, bytes).await
    }

    pub(crate) async fn get_plain_json<T: DeserializeOwned>(&self, path: &str) -> Result<Option<T>, String> {
        let Some(bytes) = self.get_raw_bytes(path).await? else {
            return Ok(None);
        };
        let value = serde_json::from_slice(&bytes).map_err(|e| format!("解析 WebDAV JSON 失败: {}", e))?;
        Ok(Some(value))
    }

    pub(crate) async fn put_plain_json<T: Serialize + ?Sized>(&self, path: &str, value: &T) -> Result<(), String> {
        let body = serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?;
        self.put_raw_bytes(path, body).await
    }

    async fn get_raw_bytes(&self, path: &str) -> Result<Option<Vec<u8>>, String> {
        let resp = self.request(Method::GET, path).send().await.map_err(|e| e.to_string())?;
        if resp.status() == StatusCode::NOT_FOUND {
            return Ok(None);
        }
        if !resp.status().is_success() {
            return Err(format!("读取 WebDAV 文件失败: {}", resp.status()));
        }
        Ok(Some(resp.bytes().await.map_err(|e| e.to_string())?.to_vec()))
    }

    async fn put_raw_bytes(&self, path: &str, bytes: Vec<u8>) -> Result<(), String> {
        let resp = self
            .request(Method::PUT, path)
            .body(bytes)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if resp.status().is_success() {
            Ok(())
        } else {
            Err(format!("写入 WebDAV 文件失败: {}", resp.status()))
        }
    }

    pub async fn put_file_with_progress(
        &self,
        path: &str,
        source: &Path,
        progress: Option<WebdavUploadProgressCallback>,
    ) -> Result<(), String> {
        let size = tokio::fs::metadata(source)
            .await
            .map_err(|e| format!("读取待上传文件信息失败: {}", e))?
            .len();
        if let Some(crypto) = self.crypto.as_ref() {
            let plaintext = tokio::fs::read(source)
                .await
                .map_err(|e| format!("读取待上传文件失败: {}", e))?;
            let encrypted = crypto.encrypt_bytes(&normalize_path(path), &plaintext)?;
            return self.put_raw_bytes_with_progress(path, encrypted, size, progress).await;
        }
        let file = tokio::fs::File::open(source)
            .await
            .map_err(|e| format!("打开待上传文件失败: {}", e))?;
        if let Some(callback) = progress.as_ref() {
            callback(0);
        }
        let reader = UploadProgressReader::new(file, size, progress);
        let stream = tokio_util::io::ReaderStream::with_capacity(reader, WEBDAV_FILE_UPLOAD_BUFFER_SIZE);
        let body = reqwest::Body::wrap_stream(stream);
        let resp = self
            .request(Method::PUT, path)
            .header("Content-Length", size)
            .body(body)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if resp.status().is_success() {
            Ok(())
        } else {
            Err(format!("上传 WebDAV 文件失败: {}", resp.status()))
        }
    }

    pub async fn download_file(&self, path: &str, destination: &Path) -> Result<(), String> {
        if let Some(parent) = destination.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| format!("创建下载目录失败: {}", e))?;
        }

        let bytes = self
            .get_bytes(path)
            .await?
            .ok_or_else(|| "云端文件不存在".to_string())?;
        let mut file = tokio::fs::File::create(destination)
            .await
            .map_err(|e| format!("创建本地下载文件失败: {}", e))?;
        file.write_all(&bytes)
            .await
            .map_err(|e| format!("写入本地下载文件失败: {}", e))?;
        file.flush()
            .await
            .map_err(|e| format!("写入本地下载文件失败: {}", e))
    }

    pub async fn delete_path(&self, path: &str) -> Result<(), String> {
        let resp = self.request(Method::DELETE, path).send().await.map_err(|e| e.to_string())?;
        if resp.status().is_success() || resp.status() == StatusCode::NOT_FOUND {
            Ok(())
        } else {
            Err(format!("删除 WebDAV 文件失败: {} {}", path, resp.status()))
        }
    }

    pub async fn mkcol(&self, path: &str) -> Result<(), String> {
        let method = Method::from_bytes(b"MKCOL").map_err(|e| e.to_string())?;
        let resp = self.request(method, path).send().await.map_err(|e| e.to_string())?;
        if resp.status().is_success()
            || resp.status() == StatusCode::METHOD_NOT_ALLOWED
            || resp.status().as_u16() == 405
        {
            Ok(())
        } else {
            Err(format!("创建 WebDAV 目录失败: {} {}", path, resp.status()))
        }
    }

    fn request(&self, method: Method, path: &str) -> reqwest::RequestBuilder {
        let url = self.url_for(path);
        let builder = self.client.request(method, url);
        if self.config.username.trim().is_empty() {
            builder
        } else {
            builder.basic_auth(self.config.username.clone(), Some(self.config.password.clone()))
        }
    }

    fn url_for(&self, path: &str) -> String {
        let path = normalize_path(path);
        if path.is_empty() {
            self.base_url.clone()
        } else {
            format!("{}/{}", self.base_url, path)
        }
    }

    fn encryption_scope(&self) -> String {
        format!("{}\n{}", self.base_url, self.config.username.trim())
    }

    async fn put_raw_bytes_with_progress(
        &self,
        path: &str,
        bytes: Vec<u8>,
        progress_total: u64,
        progress: Option<WebdavUploadProgressCallback>,
    ) -> Result<(), String> {
        if let Some(callback) = progress.as_ref() {
            callback(0);
        }
        let content_length = bytes.len() as u64;
        let reader = UploadProgressReader::new(
            BytesUploadReader::new(bytes),
            progress_total,
            progress,
        );
        let stream = tokio_util::io::ReaderStream::with_capacity(reader, WEBDAV_FILE_UPLOAD_BUFFER_SIZE);
        let body = reqwest::Body::wrap_stream(stream);
        let resp = self
            .request(Method::PUT, path)
            .header("Content-Length", content_length)
            .body(body)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if resp.status().is_success() {
            Ok(())
        } else {
            Err(format!("上传 WebDAV 文件失败: {}", resp.status()))
        }
    }
}

struct BytesUploadReader {
    bytes: Vec<u8>,
    offset: usize,
}

impl BytesUploadReader {
    fn new(bytes: Vec<u8>) -> Self {
        Self { bytes, offset: 0 }
    }
}

impl AsyncRead for BytesUploadReader {
    fn poll_read(
        mut self: Pin<&mut Self>,
        _cx: &mut Context<'_>,
        buf: &mut tokio::io::ReadBuf<'_>,
    ) -> Poll<std::io::Result<()>> {
        if self.offset >= self.bytes.len() || buf.remaining() == 0 {
            return Poll::Ready(Ok(()));
        }
        let end = cmp::min(self.bytes.len(), self.offset + buf.remaining());
        let chunk = &self.bytes[self.offset..end];
        buf.put_slice(chunk);
        self.offset = end;
        Poll::Ready(Ok(()))
    }
}

struct UploadProgressReader<R> {
    inner: R,
    sent: u64,
    total: u64,
    last_reported: u64,
    callback: Option<WebdavUploadProgressCallback>,
}

impl<R> UploadProgressReader<R> {
    fn new(inner: R, total: u64, callback: Option<WebdavUploadProgressCallback>) -> Self {
        Self {
            inner,
            sent: 0,
            total,
            last_reported: 0,
            callback,
        }
    }
}

impl<R: AsyncRead + Unpin> AsyncRead for UploadProgressReader<R> {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut tokio::io::ReadBuf<'_>,
    ) -> Poll<std::io::Result<()>> {
        let before = buf.filled().len();
        let poll = Pin::new(&mut self.inner).poll_read(cx, buf);
        if let Poll::Ready(Ok(())) = &poll {
            let read = buf.filled().len().saturating_sub(before) as u64;
            if read > 0 {
                self.sent = self.sent.saturating_add(read).min(self.total);
                let should_report = self.sent == self.total
                    || self.sent.saturating_sub(self.last_reported) >= WEBDAV_FILE_UPLOAD_BUFFER_SIZE as u64;
                if should_report {
                    self.last_reported = self.sent;
                    if let Some(callback) = self.callback.as_ref() {
                        callback(self.sent);
                    }
                }
            }
        }
        poll
    }
}

fn normalize_path(path: &str) -> String {
    path.replace('\\', "/")
        .split('/')
        .filter(|p| !p.trim().is_empty())
        .collect::<Vec<_>>()
        .join("/")
}
