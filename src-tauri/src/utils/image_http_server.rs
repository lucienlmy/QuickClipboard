use once_cell::sync::Lazy;
use parking_lot::Mutex;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::thread;

struct HttpImageStore {
    raw_images: Vec<Vec<u8>>,
}

static IMAGE_STORE: Lazy<Mutex<Option<HttpImageStore>>> =
    Lazy::new(|| Mutex::new(None));

// 贴图编辑模式数据
#[derive(Clone, Debug, serde::Serialize)]
pub struct PinEditData {
    pub image_path: String,
    pub x: i32,              
    pub y: i32,              
    pub width: u32,          
    pub height: u32,         
    pub logical_width: u32,  
    pub logical_height: u32, 
    pub scale_factor: f64,
    pub window_label: String,
    pub window_x: i32,
    pub window_y: i32,
    pub window_width: f64,
    pub window_height: f64,
    pub original_image_path: Option<String>, 
    pub edit_data: Option<String>,           
}

static PIN_EDIT_DATA: Lazy<Mutex<Option<PinEditData>>> =
    Lazy::new(|| Mutex::new(None));

static SERVER_PORT: Lazy<Mutex<Option<u16>>> =
    Lazy::new(|| Mutex::new(None));

fn send_http_404(mut stream: TcpStream) {
    let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
}

fn send_http_raw_image(mut stream: TcpStream, index: usize) {
    let store_guard = IMAGE_STORE.lock();
    let Some(store) = store_guard.as_ref() else {
        send_http_404(stream);
        return;
    };

    let Some(raw_data) = store.raw_images.get(index) else {
        send_http_404(stream);
        return;
    };

    let header = format!(
        "HTTP/1.1 200 OK\r\n\
        Content-Type: application/octet-stream\r\n\
        Content-Length: {}\r\n\
        Access-Control-Allow-Origin: *\r\n\
        Access-Control-Allow-Methods: GET, OPTIONS\r\n\
        Access-Control-Allow-Headers: *\r\n\
        Cache-Control: no-cache\r\n\
        Connection: close\r\n\r\n",
        raw_data.len()
    );

    let _ = stream.write_all(header.as_bytes());
    let _ = stream.write_all(raw_data);
    let _ = stream.flush();
}

fn handle_http_request(mut stream: TcpStream) {
    let mut buffer = [0u8; 1024];
    let _ = stream.read(&mut buffer);
    let request = String::from_utf8_lossy(&buffer);
    let first_line = request.lines().next().unwrap_or("");
    let path = first_line.split_whitespace().nth(1).unwrap_or("/");
    
    let (path_without_query, _query) = path.split_once('?').unwrap_or((path, ""));

    if path_without_query.starts_with("/screen/") && path_without_query.ends_with(".raw") {
        let idx_str = &path_without_query[8..path_without_query.len() - 4];
        if let Ok(index) = idx_str.parse::<usize>() {
            send_http_raw_image(stream, index);
            return;
        }
    }

    send_http_404(stream);
}

fn ensure_http_server_started() -> Result<u16, String> {
    {
        let guard = SERVER_PORT.lock();
        if let Some(port) = *guard {
            return Ok(port);
        }
    }

    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("绑定 HTTP 服务器端口失败: {}", e))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("获取 HTTP 服务器端口失败: {}", e))?
        .port();

    {
        let mut guard = SERVER_PORT.lock();
        *guard = Some(port);
    }

    thread::spawn(move || {
        loop {
            match listener.accept() {
                Ok((stream, _)) => {
                    thread::spawn(move || {
                        handle_http_request(stream);
                    });
                }
                Err(_) => {
                    break;
                }
            }
        }
    });

    Ok(port)
}

pub fn set_raw_images(raw_images: Vec<Vec<u8>>) -> Result<u16, String> {
    let port = ensure_http_server_started()?;
    let mut guard = IMAGE_STORE.lock();
    *guard = Some(HttpImageStore { raw_images });
    Ok(port)
}

// 设置贴图编辑数据
pub fn set_pin_edit_data(data: PinEditData) -> Result<u16, String> {
    let port = ensure_http_server_started()?;
    let mut guard = PIN_EDIT_DATA.lock();
    *guard = Some(data);
    Ok(port)
}

// 获取贴图编辑数据
pub fn get_pin_edit_data() -> Option<PinEditData> {
    let guard = PIN_EDIT_DATA.lock();
    guard.clone()
}

// 清除贴图编辑数据
pub fn clear_pin_edit_data() {
    let mut guard = PIN_EDIT_DATA.lock();
    *guard = None;
}

// 清除原始图像缓存
pub fn clear_raw_images() {
    let mut guard = IMAGE_STORE.lock();
    *guard = None;
}
