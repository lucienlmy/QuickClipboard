use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use uuid::Uuid;

use super::webdav_client::WebdavClient;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CloudFileIndex {
    #[serde(default)]
    pub files: HashMap<String, CloudFileManifest>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudFileManifest {
    pub id: String,
    pub name: String,
    pub size: u64,
    pub sha256: String,
    #[serde(default = "default_cloud_file_chunk_size")]
    pub chunk_size: u64,
    #[serde(default)]
    pub chunks: u32,
    pub source_device_id: String,
    pub source_device_name: String,
    pub uploaded_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudFileUploadResult {
    pub manifest: CloudFileManifest,
}

#[derive(Clone)]
pub struct CloudFileUploadProgress {
    pub transfer_id: String,
    pub file_path: String,
    pub sent_bytes: u64,
    pub total_bytes: u64,
    pub status: String,
}

pub type CloudFileUploadProgressCallback = Arc<dyn Fn(CloudFileUploadProgress) + Send + Sync + 'static>;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudFileListItem {
    pub id: String,
    pub name: String,
    pub size: u64,
    pub sha256: String,
    pub source_device_id: String,
    pub source_device_name: String,
    pub uploaded_at: i64,
    pub local_status: String,
    pub local_path: Option<String>,
    pub downloaded_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudFileDownloadResult {
    pub file: CloudFileListItem,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct CloudFileDownloadIndex {
    #[serde(default)]
    files: HashMap<String, CloudFileDownloadRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CloudFileDownloadRecord {
    path: String,
    downloaded_at: i64,
    sha256: String,
}

const INDEX_PATH: &str = "cloud_files/index.json";
const CLOUD_FILE_CHUNK_SIZE: usize = 8 * 1024 * 1024;
const DOWNLOADS_DIR: &str = "cloud_file_downloads";
const DOWNLOAD_FILES_DIR: &str = "files";
const DOWNLOAD_INDEX_NAME: &str = "index.json";
static CLOUD_FILES_DIR_READY: AtomicBool = AtomicBool::new(false);

fn default_cloud_file_chunk_size() -> u64 {
    CLOUD_FILE_CHUNK_SIZE as u64
}

pub async fn upload_file_with_progress(
    client: &WebdavClient,
    path: &str,
    transfer_id: Option<String>,
    progress: Option<CloudFileUploadProgressCallback>,
) -> Result<CloudFileUploadResult, String> {
    let source = PathBuf::from(path);
    let metadata = std::fs::metadata(&source)
        .map_err(|e| format!("读取待上传文件信息失败: {}", e))?;
    if !metadata.is_file() {
        return Err("只能上传普通文件".to_string());
    }

    let name = source
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "文件名无效".to_string())?
        .to_string();
    let size = metadata.len();
    let sha256 = sha256_file(&source)?;
    let mut index = load_index(client).await?;
    if let Some(existing) = index
        .files
        .values()
        .find(|file| file.sha256 == sha256 && file.size == size)
        .cloned()
    {
        return Ok(CloudFileUploadResult { manifest: existing });
    }

    let id = Uuid::new_v4().to_string();
    let object_dir = format!("cloud_files/objects/{}", id);

    prepare_cloud_object_dir(client, &object_dir).await?;

    let upload_progress = progress.map(|callback| {
        let transfer_id = transfer_id.unwrap_or_else(|| format!("cloud:{}", source.to_string_lossy()));
        let file_path = source.to_string_lossy().to_string();
        Arc::new(move |sent_bytes| {
            callback(CloudFileUploadProgress {
                transfer_id: transfer_id.clone(),
                file_path: file_path.clone(),
                sent_bytes,
                total_bytes: size,
                status: "uploading".to_string(),
            });
        }) as Arc<dyn Fn(u64) + Send + Sync + 'static>
    });

    let chunks = match upload_file_chunks(client, &object_dir, &source, size, upload_progress).await {
        Ok(chunks) => chunks,
        Err(error) => {
            let _ = delete_cloud_object(client, &object_dir, None).await;
            return Err(error);
        }
    };

    let manifest = CloudFileManifest {
        id: id.clone(),
        name: name.clone(),
        size,
        sha256,
        chunk_size: CLOUD_FILE_CHUNK_SIZE as u64,
        chunks,
        source_device_id: crate::services::sync_transfer::device_id(),
        source_device_name: crate::services::sync_transfer::lan::runtime::device_name(),
        uploaded_at: chrono::Utc::now().timestamp_millis(),
    };

    index.files.insert(id, manifest.clone());
    if let Err(error) = save_index(client, &index).await {
        let _ = delete_cloud_object(client, &object_dir, Some(chunks)).await;
        return Err(error);
    }

    Ok(CloudFileUploadResult { manifest })
}

pub async fn list_files(client: &WebdavClient) -> Result<Vec<CloudFileListItem>, String> {
    let download_index = load_download_index()?;
    let mut files = load_index(client)
        .await?
        .files
        .into_values()
        .map(|file| to_list_item(file, &download_index))
        .collect::<Vec<_>>();
    files.sort_by(|a, b| b.uploaded_at.cmp(&a.uploaded_at).then(a.name.cmp(&b.name)));
    Ok(files)
}

pub async fn download_file(client: &WebdavClient, file_id: &str) -> Result<CloudFileDownloadResult, String> {
    validate_file_id(file_id)?;
    let index = load_index(client).await?;
    let manifest = index
        .files
        .get(file_id)
        .cloned()
        .ok_or_else(|| "云端文件不存在".to_string())?;

    let mut download_index = load_download_index()?;
    let target = local_download_path(&manifest, &download_index)?;
    if target.exists() && sha256_file(&target)? == manifest.sha256 {
        download_index.files.insert(manifest.id.clone(), CloudFileDownloadRecord {
            path: target.to_string_lossy().to_string(),
            downloaded_at: chrono::Utc::now().timestamp_millis(),
            sha256: manifest.sha256.clone(),
        });
        save_download_index(&download_index)?;
        return Ok(CloudFileDownloadResult {
            file: to_list_item(manifest, &download_index),
        });
    }

    let temp = target.with_extension(format!(
        "{}.qcpart",
        target.extension().and_then(|value| value.to_str()).unwrap_or("tmp")
    ));
    if temp.exists() {
        let _ = std::fs::remove_file(&temp);
    }

    if manifest.chunks == 0 && manifest.size == 0 {
        tokio::fs::write(&temp, b"")
            .await
            .map_err(|e| format!("保存空文件失败: {}", e))?;
    } else if manifest.chunks == 0 {
        client
            .download_file(&format!("cloud_files/objects/{}/data", manifest.id), &temp)
            .await?;
    } else {
        download_file_chunks(client, &manifest, &temp).await?;
    }

    let actual_sha256 = sha256_file(&temp)?;
    if actual_sha256 != manifest.sha256 {
        let _ = std::fs::remove_file(&temp);
        return Err("下载文件校验失败".to_string());
    }

    if target.exists() {
        std::fs::remove_file(&target)
            .map_err(|e| format!("替换本地下载文件失败: {}", e))?;
    }
    std::fs::rename(&temp, &target)
        .map_err(|e| format!("保存本地下载文件失败: {}", e))?;

    download_index.files.insert(manifest.id.clone(), CloudFileDownloadRecord {
        path: target.to_string_lossy().to_string(),
        downloaded_at: chrono::Utc::now().timestamp_millis(),
        sha256: manifest.sha256.clone(),
    });
    save_download_index(&download_index)?;

    Ok(CloudFileDownloadResult {
        file: to_list_item(manifest, &download_index),
    })
}

pub async fn delete_file(client: &WebdavClient, file_id: &str) -> Result<(), String> {
    validate_file_id(file_id)?;
    let mut index = load_index(client).await?;
    let manifest = index
        .files
        .remove(file_id)
        .ok_or_else(|| "云端文件不存在".to_string())?;
    let object_dir = format!("cloud_files/objects/{}", manifest.id);

    delete_cloud_object(client, &object_dir, Some(manifest.chunks)).await?;
    save_index(client, &index).await?;

    let mut download_index = load_download_index()?;
    if download_index.files.remove(&manifest.id).is_some() {
        save_download_index(&download_index)?;
    }
    Ok(())
}

pub async fn load_index(client: &WebdavClient) -> Result<CloudFileIndex, String> {
    Ok(client.get_json(INDEX_PATH).await?.unwrap_or_default())
}

async fn save_index(client: &WebdavClient, index: &CloudFileIndex) -> Result<(), String> {
    client.put_json(INDEX_PATH, index).await
}

async fn prepare_cloud_object_dir(client: &WebdavClient, object_dir: &str) -> Result<(), String> {
    ensure_cloud_files_dir_once(client).await?;
    match client.mkcol(object_dir).await {
        Ok(()) => client.mkcol(&format!("{}/chunks", object_dir)).await,
        Err(first_error) => {
            CLOUD_FILES_DIR_READY.store(false, Ordering::Release);
            ensure_cloud_files_dir_once(client).await?;
            client.mkcol(object_dir).await.map_err(|second_error| {
                format!("创建云端文件对象目录失败: {}; 重试后仍失败: {}", first_error, second_error)
            })?;
            client.mkcol(&format!("{}/chunks", object_dir)).await
        }
    }
}

async fn ensure_cloud_files_dir_once(client: &WebdavClient) -> Result<(), String> {
    if !CLOUD_FILES_DIR_READY.load(Ordering::Acquire) {
        client.ensure_cloud_files_dir().await?;
        CLOUD_FILES_DIR_READY.store(true, Ordering::Release);
    }
    Ok(())
}

async fn delete_cloud_object(client: &WebdavClient, object_dir: &str, chunks: Option<u32>) -> Result<(), String> {
    if client.delete_path(object_dir).await.is_ok() {
        return Ok(());
    }

    if let Some(chunks) = chunks {
        for index in 0..chunks {
            let _ = client.delete_path(&cloud_file_chunk_path(object_dir, index)).await;
        }
    }
    client.delete_path(&format!("{}/data", object_dir)).await?;
    let _ = client.delete_path(&format!("{}/manifest.json", object_dir)).await;
    let _ = client.delete_path(&format!("{}/chunks", object_dir)).await;
    let _ = client.delete_path(object_dir).await;
    Ok(())
}

async fn upload_file_chunks(
    client: &WebdavClient,
    object_dir: &str,
    source: &Path,
    size: u64,
    progress: Option<Arc<dyn Fn(u64) + Send + Sync + 'static>>,
) -> Result<u32, String> {
    if let Some(callback) = progress.as_ref() {
        callback(0);
    }
    if size == 0 {
        return Ok(0);
    }

    let mut file = tokio::fs::File::open(source)
        .await
        .map_err(|e| format!("打开待上传文件失败: {}", e))?;
    let mut buffer = vec![0u8; CLOUD_FILE_CHUNK_SIZE];
    let mut chunk_index = 0u32;
    let mut sent_bytes = 0u64;

    loop {
        let read = file
            .read(&mut buffer)
            .await
            .map_err(|e| format!("读取待上传文件失败: {}", e))?;
        if read == 0 {
            break;
        }
        let path = cloud_file_chunk_path(object_dir, chunk_index);
        if let Err(error) = client.put_bytes(&path, buffer[..read].to_vec()).await {
            delete_uploaded_chunks(client, object_dir, chunk_index).await;
            return Err(error);
        }
        sent_bytes = sent_bytes.saturating_add(read as u64).min(size);
        if let Some(callback) = progress.as_ref() {
            callback(sent_bytes);
        }
        chunk_index = chunk_index
            .checked_add(1)
            .ok_or_else(|| "云端文件分块数量过多".to_string())?;
    }

    Ok(chunk_index)
}

async fn download_file_chunks(
    client: &WebdavClient,
    manifest: &CloudFileManifest,
    target: &Path,
) -> Result<(), String> {
    let object_dir = format!("cloud_files/objects/{}", manifest.id);
    let mut file = tokio::fs::File::create(target)
        .await
        .map_err(|e| format!("创建本地下载文件失败: {}", e))?;
    for index in 0..manifest.chunks {
        let bytes = client
            .get_bytes(&cloud_file_chunk_path(&object_dir, index))
            .await?
            .ok_or_else(|| format!("云端文件分块缺失: {}", index + 1))?;
        file.write_all(&bytes)
            .await
            .map_err(|e| format!("写入本地下载文件失败: {}", e))?;
    }
    file.flush()
        .await
        .map_err(|e| format!("写入本地下载文件失败: {}", e))
}

async fn delete_uploaded_chunks(client: &WebdavClient, object_dir: &str, uploaded_chunks: u32) {
    for index in 0..uploaded_chunks {
        let _ = client.delete_path(&cloud_file_chunk_path(object_dir, index)).await;
    }
    let _ = client.delete_path(&format!("{}/chunks", object_dir)).await;
}

fn cloud_file_chunk_path(object_dir: &str, index: u32) -> String {
    format!("{}/chunks/{:06}.bin", object_dir, index)
}

fn to_list_item(file: CloudFileManifest, download_index: &CloudFileDownloadIndex) -> CloudFileListItem {
    let record = download_index.files.get(&file.id);
    let (local_status, local_path, downloaded_at) = match record {
        Some(record) if PathBuf::from(&record.path).exists() => (
            "downloaded".to_string(),
            Some(record.path.clone()),
            record.downloaded_at,
        ),
        Some(record) => (
            "missing".to_string(),
            Some(record.path.clone()),
            record.downloaded_at,
        ),
        None => ("notDownloaded".to_string(), None, 0),
    };

    CloudFileListItem {
        id: file.id,
        name: file.name,
        size: file.size,
        sha256: file.sha256,
        source_device_id: file.source_device_id,
        source_device_name: file.source_device_name,
        uploaded_at: file.uploaded_at,
        local_status,
        local_path,
        downloaded_at,
    }
}

fn load_download_index() -> Result<CloudFileDownloadIndex, String> {
    let path = download_index_path()?;
    if !path.exists() {
        return Ok(CloudFileDownloadIndex::default());
    }
    let bytes = std::fs::read(&path)
        .map_err(|e| format!("读取云端下载状态失败: {}", e))?;
    serde_json::from_slice(&bytes)
        .map_err(|e| format!("解析云端下载状态失败: {}", e))
}

fn save_download_index(index: &CloudFileDownloadIndex) -> Result<(), String> {
    let path = download_index_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("创建云端下载状态目录失败: {}", e))?;
    }
    let bytes = serde_json::to_vec_pretty(index)
        .map_err(|e| format!("序列化云端下载状态失败: {}", e))?;
    std::fs::write(&path, bytes)
        .map_err(|e| format!("保存云端下载状态失败: {}", e))
}

fn download_index_path() -> Result<PathBuf, String> {
    Ok(downloads_dir()?.join(DOWNLOAD_INDEX_NAME))
}

fn local_download_path(manifest: &CloudFileManifest, download_index: &CloudFileDownloadIndex) -> Result<PathBuf, String> {
    validate_file_id(&manifest.id)?;
    if let Some(record) = download_index.files.get(&manifest.id) {
        let path = PathBuf::from(&record.path);
        if path.exists() {
            return Ok(path);
        }
    }
    let dir = download_files_dir()?;
    let file_name = sanitize_file_name(&manifest.name);
    Ok(unique_download_path(&dir, &file_name, &manifest.id, download_index))
}

fn downloads_dir() -> Result<PathBuf, String> {
    Ok(crate::services::get_data_directory()?.join(DOWNLOADS_DIR))
}

fn download_files_dir() -> Result<PathBuf, String> {
    Ok(downloads_dir()?.join(DOWNLOAD_FILES_DIR))
}

fn unique_download_path(
    dir: &Path,
    file_name: &str,
    file_id: &str,
    download_index: &CloudFileDownloadIndex,
) -> PathBuf {
    let (stem, extension) = split_file_name(file_name);
    let mut suffix = 0u32;
    loop {
        let candidate_name = if suffix == 0 {
            file_name.to_string()
        } else if let Some(extension) = extension.as_deref() {
            format!("{} ({}).{}", stem, suffix + 1, extension)
        } else {
            format!("{} ({})", stem, suffix + 1)
        };
        let candidate = dir.join(candidate_name);
        if !candidate.exists() && !download_path_used_by_other(file_id, &candidate, download_index) {
            return candidate;
        }
        suffix = suffix.saturating_add(1);
    }
}

fn download_path_used_by_other(
    file_id: &str,
    candidate: &Path,
    download_index: &CloudFileDownloadIndex,
) -> bool {
    download_index.files.iter().any(|(id, record)| {
        id != file_id && PathBuf::from(&record.path) == candidate
    })
}

fn split_file_name(file_name: &str) -> (String, Option<String>) {
    let path = Path::new(file_name);
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("file")
        .to_string();
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string());
    (stem, extension)
}

fn validate_file_id(file_id: &str) -> Result<(), String> {
    let valid = !file_id.trim().is_empty()
        && file_id
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_');
    if valid {
        Ok(())
    } else {
        Err("云端文件 ID 无效".to_string())
    }
}

fn sanitize_file_name(name: &str) -> String {
    let mut out = name
        .chars()
        .map(|ch| {
            if ch.is_control() || matches!(ch, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') {
                '_'
            } else {
                ch
            }
        })
        .collect::<String>()
        .trim_matches(|ch| ch == ' ' || ch == '.')
        .to_string();
    if out.is_empty() {
        out = "file".to_string();
    }
    let stem = out
        .split('.')
        .next()
        .unwrap_or("")
        .to_ascii_uppercase();
    if matches!(
        stem.as_str(),
        "CON" | "PRN" | "AUX" | "NUL" | "COM1" | "COM2" | "COM3" | "COM4" | "COM5" | "COM6" | "COM7" | "COM8" | "COM9"
            | "LPT1" | "LPT2" | "LPT3" | "LPT4" | "LPT5" | "LPT6" | "LPT7" | "LPT8" | "LPT9"
    ) {
        out.insert(0, '_');
    }
    out
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = std::fs::File::open(path)
        .map_err(|e| format!("打开待上传文件失败: {}", e))?;
    let mut hasher = Sha256::new();
    std::io::copy(&mut file, &mut hasher)
        .map_err(|e| format!("计算文件校验值失败: {}", e))?;
    Ok(hex::encode(hasher.finalize()))
}
