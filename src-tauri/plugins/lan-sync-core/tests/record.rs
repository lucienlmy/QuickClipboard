use std::time::Duration;

use lan_sync_core::{ClipboardRecord, ConnectionState, CoreEvent, LanSyncConfig, LanSyncManager};

type AnyResult<T> = Result<T, Box<dyn std::error::Error + Send + Sync>>;

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn record_roundtrip_text() -> AnyResult<()> {
    let server = LanSyncManager::new(LanSyncConfig {
        device_id: "server".to_string(),
        ..Default::default()
    });
    server.set_enabled(true).await;
    let port = server.start_server(0).await?;

    let mut server_events = server.subscribe().await;

    let client = LanSyncManager::new(LanSyncConfig {
        device_id: "client".to_string(),
        ..Default::default()
    });
    client.set_enabled(true).await;
    client
        .connect_peer(&format!("ws://127.0.0.1:{}", port), false)
        .await?;

    let start = std::time::Instant::now();
    loop {
        if client.get_snapshot().await.state == ConnectionState::Connected {
            break;
        }
        if start.elapsed() > Duration::from_secs(2) {
            return Err("等待连接超时".into());
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }

    let rec = ClipboardRecord {
        uuid: "u1".to_string(),
        content: "hello".to_string(),
    };
    client.send_clipboard_record(rec.clone()).await?;

    let ev = tokio::time::timeout(Duration::from_secs(2), server_events.recv()).await??;
    match ev {
        CoreEvent::RemoteClipboardRecord { record } => {
            if record.uuid != rec.uuid || record.content != rec.content {
                return Err("收到的记录不一致".into());
            }
        }
        _ => return Err("收到的事件类型不正确".into()),
    }

    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn server_broadcast_to_client() -> AnyResult<()> {
    let server = LanSyncManager::new(LanSyncConfig {
        device_id: "server".to_string(),
        ..Default::default()
    });
    server.set_enabled(true).await;
    let port = server.start_server(0).await?;

    let client = LanSyncManager::new(LanSyncConfig {
        device_id: "client".to_string(),
        ..Default::default()
    });
    client.set_enabled(true).await;
    let mut client_events = client.subscribe().await;

    client
        .connect_peer(&format!("ws://127.0.0.1:{}", port), false)
        .await?;

    let start = std::time::Instant::now();
    loop {
        let s = server.get_snapshot().await;
        let c = client.get_snapshot().await;

        if c.state == ConnectionState::Connected
            && s.server_connected_count >= 1
            && s.server_connected_device_ids.iter().any(|d| d == "client")
        {
            break;
        }

        if start.elapsed() > Duration::from_secs(2) {
            return Err("等待连接超时".into());
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }

    let rec = ClipboardRecord {
        uuid: "s1".to_string(),
        content: "from_server".to_string(),
    };
    server.broadcast_clipboard_record(rec.clone()).await?;

    let ev = tokio::time::timeout(Duration::from_secs(2), client_events.recv()).await??;
    match ev {
        CoreEvent::RemoteClipboardRecord { record } => {
            if record.uuid != rec.uuid || record.content != rec.content {
                return Err("收到的记录不一致".into());
            }
        }
        _ => return Err("收到的事件类型不正确".into()),
    }

    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn record_queue_flush_on_connect() -> AnyResult<()> {
    let server = LanSyncManager::new(LanSyncConfig {
        device_id: "server".to_string(),
        ..Default::default()
    });
    server.set_enabled(true).await;
    let port = server.start_server(0).await?;
    let mut server_events = server.subscribe().await;

    let client = LanSyncManager::new(LanSyncConfig {
        device_id: "client".to_string(),
        ..Default::default()
    });
    client.set_enabled(true).await;

    let rec = ClipboardRecord {
        uuid: "u2".to_string(),
        content: "queued".to_string(),
    };
    client.send_clipboard_record(rec.clone()).await?;

    client
        .connect_peer(&format!("ws://127.0.0.1:{}", port), false)
        .await?;

    let start = std::time::Instant::now();
    loop {
        if client.get_snapshot().await.state == ConnectionState::Connected {
            break;
        }
        if start.elapsed() > Duration::from_secs(2) {
            return Err("等待连接超时".into());
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }

    let ev = tokio::time::timeout(Duration::from_secs(2), server_events.recv()).await??;
    match ev {
        CoreEvent::RemoteClipboardRecord { record } => {
            if record.uuid != rec.uuid || record.content != rec.content {
                return Err("收到的记录不一致".into());
            }
        }
        _ => return Err("收到的事件类型不正确".into()),
    }

    Ok(())
}
