// WebSocket 服务

use once_cell::sync::Lazy;
use parking_lot::Mutex;
use std::collections::HashMap;
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::sync::mpsc::{self, Sender, Receiver};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tungstenite::{accept, Message};

static NEXT_CONN_ID: AtomicU64 = AtomicU64::new(1);

struct Connection {
    sender: Sender<Vec<u8>>,
    sent_height: Arc<AtomicU32>,
}

static CONNECTIONS: Lazy<Mutex<HashMap<u64, Connection>>> = Lazy::new(|| Mutex::new(HashMap::new()));
static SERVER_PORT: Lazy<Mutex<Option<u16>>> = Lazy::new(|| Mutex::new(None));



fn handle_connection(stream: TcpStream) {
    let _ = stream.set_read_timeout(Some(Duration::from_millis(16)));
    let _ = stream.set_nodelay(true);
    
    let mut ws = match accept(stream) {
        Ok(ws) => ws,
        Err(_) => return,
    };

    let conn_id = NEXT_CONN_ID.fetch_add(1, Ordering::Relaxed);
    let (tx, rx): (Sender<Vec<u8>>, Receiver<Vec<u8>>) = mpsc::channel();
    let sent_height = Arc::new(AtomicU32::new(0));
    
    {
        let mut conns = CONNECTIONS.lock();
        conns.insert(conn_id, Connection { 
            sender: tx, 
            sent_height: sent_height.clone() 
        });
    }

    loop {
        while let Ok(data) = rx.try_recv() {
            if ws.send(Message::Binary(data.into())).is_err() {
                break;
            }
        }
        let _ = ws.flush();
        match ws.read() {
            Ok(Message::Close(_)) => break,
            Ok(Message::Ping(data)) => {
                let _ = ws.send(Message::Pong(data));
            }
            Err(tungstenite::Error::Io(ref e)) 
                if e.kind() == std::io::ErrorKind::WouldBlock 
                || e.kind() == std::io::ErrorKind::TimedOut => {}
            Err(_) => break,
            _ => {}
        }
    }

    {
        let mut conns = CONNECTIONS.lock();
        conns.remove(&conn_id);
    }
}

fn start_server() -> Result<u16, String> {
    {
        let guard = SERVER_PORT.lock();
        if let Some(port) = *guard {
            return Ok(port);
        }
    }

    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("绑定端口失败: {}", e))?;
    let port = listener.local_addr()
        .map_err(|e| format!("获取端口失败: {}", e))?
        .port();

    {
        let mut guard = SERVER_PORT.lock();
        *guard = Some(port);
    }

    thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            thread::spawn(|| handle_connection(stream));
        }
    });

    Ok(port)
}

pub fn get_port() -> Result<u16, String> {
    start_server()
}

// 推送预览数据
pub fn push_preview(data: Arc<Vec<u8>>, width: u32, height: u32) {
    push_preview_with_direction(data, width, height, false)
}

pub fn push_preview_with_direction(data: Arc<Vec<u8>>, width: u32, height: u32, insert_at_top: bool) {
    if data.is_empty() || width == 0 || height == 0 {
        return;
    }

    let conns = CONNECTIONS.lock();
    let row_bytes = (width * 4) as usize;
    
    for conn in conns.values() {
        let sent = conn.sent_height.load(Ordering::Relaxed);

        let (start_row, send_height) = if insert_at_top {
            if sent >= height {
                continue;
            }
            let new_rows = height - sent;
            (0, new_rows)
        } else {
            if sent >= height {
                continue;
            } else if sent > 0 {
                (sent, height - sent)
            } else {
                (0, height)
            }
        };
        
        let start_byte = (start_row as usize) * row_bytes;
        let send_bytes = (send_height as usize) * row_bytes;
        
        if start_byte + send_bytes > data.len() {
            continue;
        }

        let mut msg = Vec::with_capacity(17 + send_bytes);
        msg.push(if insert_at_top { 0x81 } else { 0x01 });
        msg.extend_from_slice(&width.to_le_bytes());
        msg.extend_from_slice(&height.to_le_bytes());
        msg.extend_from_slice(&start_row.to_le_bytes());
        msg.extend_from_slice(&send_height.to_le_bytes());
        msg.extend_from_slice(&data[start_byte..start_byte + send_bytes]);
        
        if conn.sender.send(msg).is_ok() {
            conn.sent_height.store(height, Ordering::Relaxed);
        }
    }
}

pub fn push_realtime(data: &[u8], width: u32, height: u32) {
    if data.is_empty() || width == 0 || height == 0 {
        return;
    }

    let mut msg = Vec::with_capacity(17 + data.len());
    msg.push(0x02);
    msg.extend_from_slice(&width.to_le_bytes());
    msg.extend_from_slice(&height.to_le_bytes());
    msg.extend_from_slice(&0u32.to_le_bytes());
    msg.extend_from_slice(&height.to_le_bytes());
    msg.extend_from_slice(data);

    let conns = CONNECTIONS.lock();
    for conn in conns.values() {
        let _ = conn.sender.send(msg.clone());
    }
}

pub fn clear_realtime() {
    let mut msg = Vec::with_capacity(17);
    msg.push(0x02);
    msg.extend_from_slice(&0u32.to_le_bytes());
    msg.extend_from_slice(&0u32.to_le_bytes());
    msg.extend_from_slice(&0u32.to_le_bytes());
    msg.extend_from_slice(&0u32.to_le_bytes());
    
    let conns = CONNECTIONS.lock();
    for conn in conns.values() {
        let _ = conn.sender.send(msg.clone());
    }
}

pub fn clear() {
    let mut conns = CONNECTIONS.lock();
    conns.clear();
}

// 重置所有连接的发送高度（裁剪后强制重新发送）
pub fn reset_sent_height() {
    let conns = CONNECTIONS.lock();
    for conn in conns.values() {
        conn.sent_height.store(0, Ordering::Relaxed);
    }
}
