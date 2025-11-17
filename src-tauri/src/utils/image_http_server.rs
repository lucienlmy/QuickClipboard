use once_cell::sync::Lazy;
use parking_lot::Mutex;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::thread;

struct HttpImageStore {
    images: Vec<Vec<u8>>,
}

static IMAGE_STORE: Lazy<Mutex<Option<HttpImageStore>>> =
    Lazy::new(|| Mutex::new(None));

static SERVER_PORT: Lazy<Mutex<Option<u16>>> =
    Lazy::new(|| Mutex::new(None));

fn send_http_404(mut stream: TcpStream) {
    let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
}

fn send_http_image(mut stream: TcpStream, index: usize) {
    let store_guard = IMAGE_STORE.lock();
    let Some(store) = store_guard.as_ref() else {
        send_http_404(stream);
        return;
    };

    let Some(image_data) = store.images.get(index) else {
        send_http_404(stream);
        return;
    };

    let header = format!(
        "HTTP/1.1 200 OK\r\n\
        Content-Type: image/bmp\r\n\
        Content-Length: {}\r\n\
        Access-Control-Allow-Origin: *\r\n\
        Access-Control-Allow-Methods: GET, OPTIONS\r\n\
        Access-Control-Allow-Headers: *\r\n\
        Cache-Control: no-cache\r\n\
        Connection: close\r\n\r\n",
        image_data.len()
    );

    let _ = stream.write_all(header.as_bytes());
    let _ = stream.write_all(image_data);
    let _ = stream.flush();
}

fn handle_http_request(mut stream: TcpStream) {
    let mut buffer = [0u8; 1024];
    let _ = stream.read(&mut buffer);
    let request = String::from_utf8_lossy(&buffer);
    let first_line = request.lines().next().unwrap_or("");
    let path = first_line.split_whitespace().nth(1).unwrap_or("/");

    if path.starts_with("/screen/") && path.ends_with(".bmp") {
        let idx_str = &path[8..path.len() - 4];
        if let Ok(index) = idx_str.parse::<usize>() {
            send_http_image(stream, index);
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
                    handle_http_request(stream);
                }
                Err(_) => {
                    break;
                }
            }
        }
    });

    Ok(port)
}

pub fn set_images(images: Vec<Vec<u8>>) -> Result<u16, String> {
    let port = ensure_http_server_started()?;
    let mut guard = IMAGE_STORE.lock();
    *guard = Some(HttpImageStore { images });
    Ok(port)
}
