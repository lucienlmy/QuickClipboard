use keyring::{Entry, Error as KeyringError};
use sha2::{Digest, Sha256};

const WEBDAV_SERVICE: &str = "quickclipboard.webdav";

pub fn get_webdav_password(url: &str, username: &str) -> Result<Option<String>, String> {
    let entry = webdav_entry(url, username)?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(e) => Err(format!("读取 WebDAV 系统凭据失败: {}", e)),
    }
}

pub fn has_webdav_password(url: &str, username: &str) -> Result<bool, String> {
    get_webdav_password(url, username).map(|password| password.is_some())
}

pub fn set_webdav_password(url: &str, username: &str, password: &str) -> Result<(), String> {
    if password.is_empty() {
        return delete_webdav_password(url, username);
    }
    webdav_entry(url, username)?
        .set_password(password)
        .map_err(|e| format!("保存 WebDAV 系统凭据失败: {}", e))
}

pub fn delete_webdav_password(url: &str, username: &str) -> Result<(), String> {
    let entry = webdav_entry(url, username)?;
    match entry.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(e) => Err(format!("删除 WebDAV 系统凭据失败: {}", e)),
    }
}

fn webdav_entry(url: &str, username: &str) -> Result<Entry, String> {
    if url.trim().is_empty() {
        return Err("请先填写 WebDAV 地址".to_string());
    }
    if username.trim().is_empty() {
        return Err("请先填写 WebDAV 用户名".to_string());
    }
    Entry::new(WEBDAV_SERVICE, &webdav_account_key(url, username))
        .map_err(|e| format!("访问系统凭据库失败: {}", e))
}

fn webdav_account_key(url: &str, username: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(normalize_webdav_url(url).as_bytes());
    hasher.update(b"\n");
    hasher.update(username.trim().as_bytes());
    format!("v1:{}", hex::encode(hasher.finalize()))
}

fn normalize_webdav_url(url: &str) -> String {
    url.trim().trim_end_matches('/').to_string()
}

#[cfg(test)]
mod tests {
    use super::{normalize_webdav_url, webdav_account_key};

    #[test]
    fn trims_trailing_slashes_for_webdav_credential_key() {
        assert_eq!(
            webdav_account_key(" https://example.com/dav/// ", "user"),
            webdav_account_key("https://example.com/dav", "user")
        );
    }

    #[test]
    fn keeps_different_users_separate() {
        assert_ne!(
            webdav_account_key("https://example.com/dav", "user-a"),
            webdav_account_key("https://example.com/dav", "user-b")
        );
    }

    #[test]
    fn normalizes_webdav_url_without_rewriting_path_case() {
        assert_eq!(
            normalize_webdav_url(" https://example.com/WebDAV/ "),
            "https://example.com/WebDAV"
        );
    }
}
