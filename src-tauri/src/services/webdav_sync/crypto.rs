use std::collections::HashMap;
use std::sync::Arc;

use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose, Engine as _};
use chacha20poly1305::aead::{Aead, Payload};
use chacha20poly1305::{KeyInit, XChaCha20Poly1305, XNonce};
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use rand_core::{OsRng, RngCore};
use serde::{Deserialize, Serialize};
use zeroize::Zeroize;

pub const CONFIG_PATH: &str = ".qc-e2ee.json";

const CONFIG_FORMAT: &str = "qc-e2ee-config-v1";
const DATA_FORMAT: &str = "qc-e2ee-data-v1";
const CIPHER_NAME: &str = "xchacha20poly1305";
const KDF_NAME: &str = "argon2id";
const KEY_LEN: usize = 32;
const NONCE_LEN: usize = 24;
const DEFAULT_MEMORY_KIB: u32 = 64 * 1024;
const DEFAULT_ITERATIONS: u32 = 3;
const DEFAULT_PARALLELISM: u32 = 1;

static MASTER_KEY_CACHE: Lazy<Mutex<HashMap<String, Arc<MasterKey>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
static CONFIG_CACHE: Lazy<Mutex<HashMap<String, WebdavE2eeConfig>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebdavE2eeConfig {
    pub format: String,
    pub kdf: KdfConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KdfConfig {
    pub name: String,
    pub salt: String,
    #[serde(rename = "memoryKiB")]
    pub memory_kib: u32,
    pub iterations: u32,
    pub parallelism: u32,
}

#[derive(Clone)]
pub struct WebdavCryptoContext {
    key: Arc<MasterKey>,
}

struct MasterKey {
    bytes: [u8; KEY_LEN],
}

impl Drop for MasterKey {
    fn drop(&mut self) {
        self.bytes.zeroize();
    }
}

#[derive(Serialize, Deserialize)]
struct DataEnvelope {
    format: String,
    cipher: CipherEnvelope,
    payload: String,
}

#[derive(Serialize, Deserialize)]
struct CipherEnvelope {
    name: String,
    nonce: String,
}

pub fn create_config() -> WebdavE2eeConfig {
    let mut salt = [0u8; 16];
    OsRng.fill_bytes(&mut salt);
    WebdavE2eeConfig {
        format: CONFIG_FORMAT.to_string(),
        kdf: KdfConfig {
            name: KDF_NAME.to_string(),
            salt: general_purpose::STANDARD.encode(salt),
            memory_kib: DEFAULT_MEMORY_KIB,
            iterations: DEFAULT_ITERATIONS,
            parallelism: DEFAULT_PARALLELISM,
        },
    }
}

pub fn context_for_config(
    scope: &str,
    config: &WebdavE2eeConfig,
    password: &str,
) -> Result<WebdavCryptoContext, String> {
    validate_config(config)?;
    if password.is_empty() {
        return Err("请先设置 WebDAV 云端加密密码".to_string());
    }

    let cache_key = cache_key(scope, config);
    if let Some(key) = MASTER_KEY_CACHE.lock().get(&cache_key).cloned() {
        return Ok(WebdavCryptoContext { key });
    }

    let key = Arc::new(MasterKey {
        bytes: derive_master_key(config, password)?,
    });
    MASTER_KEY_CACHE.lock().insert(cache_key, key.clone());
    Ok(WebdavCryptoContext { key })
}

pub fn cached_config(scope: &str) -> Option<WebdavE2eeConfig> {
    CONFIG_CACHE.lock().get(scope).cloned()
}

pub fn cache_config(scope: &str, config: &WebdavE2eeConfig) {
    CONFIG_CACHE.lock().insert(scope.to_string(), config.clone());
}

pub fn clear_cached_keys() {
    MASTER_KEY_CACHE.lock().clear();
    CONFIG_CACHE.lock().clear();
}

impl WebdavCryptoContext {
    pub fn encrypt_bytes(&self, path: &str, plaintext: &[u8]) -> Result<Vec<u8>, String> {
        let mut nonce = [0u8; NONCE_LEN];
        OsRng.fill_bytes(&mut nonce);
        let cipher = XChaCha20Poly1305::new_from_slice(&self.key.bytes)
            .map_err(|e| format!("初始化 WebDAV 加密器失败: {}", e))?;
        let payload = cipher
            .encrypt(
                XNonce::from_slice(&nonce),
                Payload {
                    msg: plaintext,
                    aad: path.as_bytes(),
                },
            )
            .map_err(|e| format!("加密 WebDAV 数据失败: {}", e))?;
        let envelope = DataEnvelope {
            format: DATA_FORMAT.to_string(),
            cipher: CipherEnvelope {
                name: CIPHER_NAME.to_string(),
                nonce: general_purpose::STANDARD.encode(nonce),
            },
            payload: general_purpose::STANDARD.encode(payload),
        };
        serde_json::to_vec(&envelope).map_err(|e| format!("编码 WebDAV 加密信封失败: {}", e))
    }

    pub fn decrypt_bytes(&self, path: &str, encrypted: &[u8]) -> Result<Vec<u8>, String> {
        let envelope: DataEnvelope = serde_json::from_slice(encrypted)
            .map_err(|_| "WebDAV 数据不是 QuickClipboard 加密格式".to_string())?;
        if envelope.format != DATA_FORMAT {
            return Err("WebDAV 数据加密格式不兼容".to_string());
        }
        if envelope.cipher.name != CIPHER_NAME {
            return Err("WebDAV 数据加密算法不受支持".to_string());
        }
        let nonce = general_purpose::STANDARD
            .decode(envelope.cipher.nonce)
            .map_err(|e| format!("解析 WebDAV 加密 nonce 失败: {}", e))?;
        if nonce.len() != NONCE_LEN {
            return Err("WebDAV 加密 nonce 长度无效".to_string());
        }
        let payload = general_purpose::STANDARD
            .decode(envelope.payload)
            .map_err(|e| format!("解析 WebDAV 加密数据失败: {}", e))?;
        let cipher = XChaCha20Poly1305::new_from_slice(&self.key.bytes)
            .map_err(|e| format!("初始化 WebDAV 解密器失败: {}", e))?;
        cipher
            .decrypt(
                XNonce::from_slice(&nonce),
                Payload {
                    msg: &payload,
                    aad: path.as_bytes(),
                },
            )
            .map_err(|_| "WebDAV 数据解密失败，请检查云端加密密码".to_string())
    }
}

fn validate_config(config: &WebdavE2eeConfig) -> Result<(), String> {
    if config.format != CONFIG_FORMAT {
        return Err("WebDAV 云端加密配置格式不兼容".to_string());
    }
    if config.kdf.name != KDF_NAME {
        return Err("WebDAV 云端加密 KDF 不受支持".to_string());
    }
    if config.kdf.memory_kib == 0 || config.kdf.iterations == 0 || config.kdf.parallelism == 0 {
        return Err("WebDAV 云端加密 KDF 参数无效".to_string());
    }
    Ok(())
}

fn derive_master_key(config: &WebdavE2eeConfig, password: &str) -> Result<[u8; KEY_LEN], String> {
    let salt = general_purpose::STANDARD
        .decode(&config.kdf.salt)
        .map_err(|e| format!("解析 WebDAV 云端加密 salt 失败: {}", e))?;
    let params = Params::new(
        config.kdf.memory_kib,
        config.kdf.iterations,
        config.kdf.parallelism,
        Some(KEY_LEN),
    )
    .map_err(|e| format!("WebDAV 云端加密 KDF 参数无效: {}", e))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = [0u8; KEY_LEN];
    argon2
        .hash_password_into(password.as_bytes(), &salt, &mut key)
        .map_err(|e| format!("派生 WebDAV 云端加密密钥失败: {}", e))?;
    Ok(key)
}

fn cache_key(scope: &str, config: &WebdavE2eeConfig) -> String {
    format!("{}\n{}", scope, config.kdf.salt)
}

#[cfg(test)]
mod tests {
    use super::{clear_cached_keys, context_for_config, create_config};

    #[test]
    fn encrypts_and_decrypts_webdav_payload() {
        clear_cached_keys();
        let config = create_config();
        let context = context_for_config("test", &config, "secret").unwrap();
        let encrypted = context.encrypt_bytes("history/index.json", b"hello").unwrap();
        assert_ne!(encrypted, b"hello");
        let decrypted = context.decrypt_bytes("history/index.json", &encrypted).unwrap();
        assert_eq!(decrypted, b"hello");
    }

    #[test]
    fn rejects_payload_moved_to_another_path() {
        clear_cached_keys();
        let config = create_config();
        let context = context_for_config("test", &config, "secret").unwrap();
        let encrypted = context.encrypt_bytes("history/index.json", b"hello").unwrap();
        let result = context.decrypt_bytes("favorites/index.json", &encrypted);
        assert!(result.is_err());
    }
}
