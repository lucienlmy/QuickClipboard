use super::receiver::{handle_http_cancel, handle_http_prepare_upload, handle_http_upload};
use super::sender::{handle_http_download, handle_http_prepare_download};
use crate::services::lan_sync::state::{
    get_local_file_http_port, sync_core_file_http_port, FileHttpRequest, FileHttpResponse, FileHttpServerState,
    FILE_HTTP_CANCEL_PATH, FILE_HTTP_DOWNLOAD_PATH, FILE_HTTP_HEADER_LIMIT, FILE_HTTP_PREPARE_DOWNLOAD_PATH,
    FILE_HTTP_PREPARE_PATH, FILE_HTTP_SERVER, FILE_HTTP_UPLOAD_PATH,
};
use std::collections::HashMap;

pub(crate) async fn stop_file_http_server() {
    let mut state = FILE_HTTP_SERVER.lock().await;
    if let Some(server) = state.take() {
        server.task.abort();
    }
}

pub(crate) async fn ensure_file_http_server_started() -> Result<u16, String> {
    let port = get_local_file_http_port();
    sync_core_file_http_port().await;

    let mut state = FILE_HTTP_SERVER.lock().await;
    if let Some(server) = state.as_ref() {
        if server.port == port && !server.task.is_finished() {
            return Ok(port);
        }
    }

    if let Some(server) = state.take() {
        server.task.abort();
    }

    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port))
        .await
        .map_err(|e| format!("文件 HTTP 服务启动失败: {e}"))?;
    let task = tokio::spawn(async move {
        loop {
            let Ok((stream, remote_addr)) = listener.accept().await else {
                break;
            };
            tokio::spawn(async move {
                let _ = handle_file_http_client(stream, remote_addr).await;
            });
        }
    });
    *state = Some(FileHttpServerState { port, task });
    Ok(port)
}

fn parse_http_query(target: &str) -> (String, HashMap<String, String>) {
    let mut query = HashMap::new();
    let mut parts = target.splitn(2, '?');
    let path = parts.next().unwrap_or("/").to_string();
    if let Some(raw_query) = parts.next() {
        for item in raw_query.split('&') {
            let mut kv = item.splitn(2, '=');
            let key = kv.next().unwrap_or("").trim();
            let value = kv.next().unwrap_or("").trim();
            if !key.is_empty() {
                query.insert(key.to_string(), value.to_string());
            }
        }
    }
    (path, query)
}

async fn read_file_http_request(stream: &mut tokio::net::TcpStream) -> Result<FileHttpRequest, String> {
    use tokio::io::AsyncReadExt;

    let mut buffer = Vec::with_capacity(4096);
    let mut chunk = vec![0u8; 2048];
    let header_end = loop {
        if buffer.len() > FILE_HTTP_HEADER_LIMIT {
            return Err("请求头过大".to_string());
        }
        let read = stream.read(&mut chunk).await.map_err(|e| e.to_string())?;
        if read == 0 {
            return Err("连接已关闭".to_string());
        }
        buffer.extend_from_slice(&chunk[..read]);
        if let Some(pos) = buffer.windows(4).position(|window| window == b"\r\n\r\n") {
            break pos + 4;
        }
    };

    let header_text = String::from_utf8_lossy(&buffer[..header_end]).to_string();
    let mut lines = header_text.split("\r\n");
    let request_line = lines.next().ok_or_else(|| "请求格式错误".to_string())?;
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or("").to_string();
    let target = parts.next().unwrap_or("").to_string();
    if method.is_empty() || target.is_empty() {
        return Err("请求格式错误".to_string());
    }

    let mut content_length = 0usize;
    for line in lines {
        if line.is_empty() {
            continue;
        }
        let mut parts = line.splitn(2, ':');
        let name = parts.next().unwrap_or("").trim().to_ascii_lowercase();
        let value = parts.next().unwrap_or("").trim();
        if name == "content-length" {
            content_length = value
                .parse::<usize>()
                .map_err(|_| "无效的 Content-Length".to_string())?;
        }
    }

    let (path, query) = parse_http_query(&target);
    Ok(FileHttpRequest {
        method,
        path,
        query,
        content_length,
        body_prefix: buffer[header_end..].to_vec(),
    })
}

async fn write_file_http_response(
    stream: &mut tokio::net::TcpStream,
    response: FileHttpResponse,
) -> Result<(), String> {
    use tokio::io::AsyncWriteExt;

    let status_text = match response.status_code {
        200 => "OK",
        400 => "Bad Request",
        403 => "Forbidden",
        404 => "Not Found",
        409 => "Conflict",
        500 => "Internal Server Error",
        _ => "OK",
    };
    let body_bytes = response.body.into_bytes();
    let header = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        response.status_code,
        status_text,
        body_bytes.len()
    );
    stream
        .write_all(header.as_bytes())
        .await
        .map_err(|e| e.to_string())?;
    stream
        .write_all(&body_bytes)
        .await
        .map_err(|e| e.to_string())?;
    stream.flush().await.map_err(|e| e.to_string())
}

async fn handle_file_http_client(
    mut stream: tokio::net::TcpStream,
    remote_addr: std::net::SocketAddr,
) -> Result<(), String> {
    use tokio::io::AsyncReadExt;

    let request = read_file_http_request(&mut stream).await?;
    let remote_ip = Some(remote_addr.ip().to_string());
    let response = match (request.method.as_str(), request.path.as_str()) {
        ("POST", FILE_HTTP_PREPARE_PATH) => {
            let mut body_bytes = request.body_prefix.clone();
            if request.content_length > body_bytes.len() {
                let remaining = request.content_length - body_bytes.len();
                let mut extra = vec![0u8; remaining];
                stream.read_exact(&mut extra).await.map_err(|e| e.to_string())?;
                body_bytes.extend_from_slice(&extra);
            }
            let body = String::from_utf8(body_bytes).map_err(|_| "请求体编码错误".to_string())?;
            handle_http_prepare_upload(body, remote_ip).await
        }
        ("POST", FILE_HTTP_PREPARE_DOWNLOAD_PATH) => {
            let mut body_bytes = request.body_prefix.clone();
            if request.content_length > body_bytes.len() {
                let remaining = request.content_length - body_bytes.len();
                let mut extra = vec![0u8; remaining];
                stream.read_exact(&mut extra).await.map_err(|e| e.to_string())?;
                body_bytes.extend_from_slice(&extra);
            }
            let body = String::from_utf8(body_bytes).map_err(|_| "请求体编码错误".to_string())?;
            handle_http_prepare_download(body, remote_ip).await
        }
        ("POST", FILE_HTTP_UPLOAD_PATH) => handle_http_upload(&mut stream, request, remote_ip).await,
        ("GET", FILE_HTTP_DOWNLOAD_PATH) => {
            handle_http_download(&mut stream, request, remote_ip).await?;
            return Ok(());
        }
        ("POST", FILE_HTTP_CANCEL_PATH) => handle_http_cancel(request, remote_ip).await,
        _ => FileHttpResponse {
            status_code: 404,
            body: r#"{"message":"未找到接口"}"#.to_string(),
        },
    };
    write_file_http_response(&mut stream, response).await
}
