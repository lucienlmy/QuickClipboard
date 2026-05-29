use reqwest::{Client, Method, StatusCode};
use serde::de::DeserializeOwned;
use serde::Serialize;

use super::types::{SyncCollection, WebdavConfig};

#[derive(Clone)]
pub struct WebdavClient {
    client: Client,
    config: WebdavConfig,
    base_url: String,
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
        })
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

    pub async fn ensure_tombstones_dir(&self) -> Result<(), String> {
        self.mkcol("").await?;
        self.mkcol("tombstones").await
    }

    pub async fn get_json<T: DeserializeOwned>(&self, path: &str) -> Result<Option<T>, String> {
        let resp = self.request(Method::GET, path).send().await.map_err(|e| e.to_string())?;
        if resp.status() == StatusCode::NOT_FOUND {
            return Ok(None);
        }
        if !resp.status().is_success() {
            return Err(format!("读取 WebDAV 文件失败: {}", resp.status()));
        }
        let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
        let value = serde_json::from_slice(&bytes).map_err(|e| format!("解析 WebDAV JSON 失败: {}", e))?;
        Ok(Some(value))
    }

    pub async fn put_json<T: Serialize + ?Sized>(&self, path: &str, value: &T) -> Result<(), String> {
        let body = serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?;
        let resp = self
            .request(Method::PUT, path)
            .header("content-type", "application/json; charset=utf-8")
            .body(body)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if resp.status().is_success() {
            Ok(())
        } else {
            Err(format!("写入 WebDAV 文件失败: {}", resp.status()))
        }
    }

    pub async fn get_bytes(&self, path: &str) -> Result<Option<Vec<u8>>, String> {
        let resp = self.request(Method::GET, path).send().await.map_err(|e| e.to_string())?;
        if resp.status() == StatusCode::NOT_FOUND {
            return Ok(None);
        }
        if !resp.status().is_success() {
            return Err(format!("读取 WebDAV 文件失败: {}", resp.status()));
        }
        Ok(Some(resp.bytes().await.map_err(|e| e.to_string())?.to_vec()))
    }

    pub async fn put_bytes(&self, path: &str, bytes: Vec<u8>) -> Result<(), String> {
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

    async fn mkcol(&self, path: &str) -> Result<(), String> {
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
}

fn normalize_path(path: &str) -> String {
    path.replace('\\', "/")
        .split('/')
        .filter(|p| !p.trim().is_empty())
        .collect::<Vec<_>>()
        .join("/")
}
