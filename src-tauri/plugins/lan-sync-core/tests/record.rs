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
        source_device_id: "client".to_string(),
        is_remote: false,
        content: "hello".to_string(),
        html_content: None,
        content_type: "text".to_string(),
        image_id: None,
        source_app: None,
        source_icon_hash: None,
        char_count: Some(5),
        created_at: 1,
        updated_at: 1,
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
async fn client_to_server_is_forwarded_to_others() -> AnyResult<()> {
    let server = LanSyncManager::new(LanSyncConfig {
        device_id: "server".to_string(),
        ..Default::default()
    });
    server.set_enabled(true).await;
    let port = server.start_server(0).await?;

    let c1 = LanSyncManager::new(LanSyncConfig {
        device_id: "c1".to_string(),
        ..Default::default()
    });
    let c2 = LanSyncManager::new(LanSyncConfig {
        device_id: "c2".to_string(),
        ..Default::default()
    });
    c1.set_enabled(true).await;
    c2.set_enabled(true).await;

    let mut ev1 = c1.subscribe().await;
    let mut ev2 = c2.subscribe().await;

    c1.connect_peer(&format!("ws://127.0.0.1:{}", port), false).await?;
    c2.connect_peer(&format!("ws://127.0.0.1:{}", port), false).await?;

    let start = std::time::Instant::now();
    loop {
        let s1 = c1.get_snapshot().await;
        let s2 = c2.get_snapshot().await;
        if s1.state == ConnectionState::Connected && s2.state == ConnectionState::Connected {
            break;
        }
        if start.elapsed() > Duration::from_secs(2) {
            return Err("等待连接超时".into());
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }

    let rec = ClipboardRecord {
        uuid: "fwd1".to_string(),
        source_device_id: "c1".to_string(),
        is_remote: false,
        content: "forward".to_string(),
        html_content: None,
        content_type: "text".to_string(),
        image_id: None,
        source_app: None,
        source_icon_hash: None,
        char_count: Some(7),
        created_at: 1,
        updated_at: 1,
    };

    c1.send_clipboard_record(rec.clone()).await?;

    let got2 = tokio::time::timeout(Duration::from_secs(2), ev2.recv()).await??;
    match got2 {
        CoreEvent::RemoteClipboardRecord { record } => {
            if record.uuid != rec.uuid || record.content != rec.content {
                return Err("收到的记录不一致".into());
            }
        }
        _ => return Err("收到的事件类型不正确".into()),
    }

    let got1 = tokio::time::timeout(Duration::from_millis(200), ev1.recv()).await;
    if got1.is_ok() {
        return Err("发送端不应收到回环".into());
    }

    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn server_broadcast_excluding_source() -> AnyResult<()> {
    let server = LanSyncManager::new(LanSyncConfig {
        device_id: "server".to_string(),
        ..Default::default()
    });
    server.set_enabled(true).await;
    let port = server.start_server(0).await?;

    let c1 = LanSyncManager::new(LanSyncConfig {
        device_id: "c1".to_string(),
        ..Default::default()
    });
    let c2 = LanSyncManager::new(LanSyncConfig {
        device_id: "c2".to_string(),
        ..Default::default()
    });
    c1.set_enabled(true).await;
    c2.set_enabled(true).await;
    let mut ev1 = c1.subscribe().await;
    let mut ev2 = c2.subscribe().await;

    c1.connect_peer(&format!("ws://127.0.0.1:{}", port), false).await?;
    c2.connect_peer(&format!("ws://127.0.0.1:{}", port), false).await?;

    let start = std::time::Instant::now();
    loop {
        let s = server.get_snapshot().await;
        let s1 = c1.get_snapshot().await;
        let s2 = c2.get_snapshot().await;
        if s1.state == ConnectionState::Connected
            && s2.state == ConnectionState::Connected
            && s.server_connected_device_ids.iter().any(|d| d == "c1")
            && s.server_connected_device_ids.iter().any(|d| d == "c2")
        {
            break;
        }
        if start.elapsed() > Duration::from_secs(2) {
            return Err("等待连接超时".into());
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }

    let rec = ClipboardRecord {
        uuid: "s3".to_string(),
        source_device_id: "c1".to_string(),
        is_remote: true,
        content: "exclude".to_string(),
        html_content: None,
        content_type: "text".to_string(),
        image_id: None,
        source_app: None,
        source_icon_hash: None,
        char_count: Some(7),
        created_at: 1,
        updated_at: 1,
    };

    server
        .broadcast_clipboard_record_excluding(rec.clone(), Some("c1"))
        .await?;

    let got2 = tokio::time::timeout(Duration::from_secs(2), ev2.recv()).await??;
    match got2 {
        CoreEvent::RemoteClipboardRecord { record } => {
            if record.uuid != rec.uuid || record.content != rec.content {
                return Err("收到的记录不一致".into());
            }
        }
        _ => return Err("收到的事件类型不正确".into()),
    }

    let got1 = tokio::time::timeout(Duration::from_millis(200), ev1.recv()).await;
    if got1.is_ok() {
        return Err("来源端不应收到广播".into());
    }

    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn server_broadcast_to_two_clients() -> AnyResult<()> {
    let server = LanSyncManager::new(LanSyncConfig {
        device_id: "server".to_string(),
        ..Default::default()
    });
    server.set_enabled(true).await;
    let port = server.start_server(0).await?;

    let client1 = LanSyncManager::new(LanSyncConfig {
        device_id: "c1".to_string(),
        ..Default::default()
    });
    let client2 = LanSyncManager::new(LanSyncConfig {
        device_id: "c2".to_string(),
        ..Default::default()
    });
    client1.set_enabled(true).await;
    client2.set_enabled(true).await;
    let mut ev1 = client1.subscribe().await;
    let mut ev2 = client2.subscribe().await;

    client1
        .connect_peer(&format!("ws://127.0.0.1:{}", port), false)
        .await?;
    client2
        .connect_peer(&format!("ws://127.0.0.1:{}", port), false)
        .await?;

    let start = std::time::Instant::now();
    loop {
        let s = server.get_snapshot().await;
        let c1 = client1.get_snapshot().await;
        let c2 = client2.get_snapshot().await;
        if c1.state == ConnectionState::Connected
            && c2.state == ConnectionState::Connected
            && s.server_connected_count >= 2
            && s.server_connected_device_ids.iter().any(|d| d == "c1")
            && s.server_connected_device_ids.iter().any(|d| d == "c2")
        {
            break;
        }
        if start.elapsed() > Duration::from_secs(2) {
            return Err("等待连接超时".into());
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }

    let rec = ClipboardRecord {
        uuid: "s2".to_string(),
        source_device_id: "server".to_string(),
        is_remote: true,
        content: "to_all".to_string(),
        html_content: None,
        content_type: "text".to_string(),
        image_id: None,
        source_app: None,
        source_icon_hash: None,
        char_count: Some(6),
        created_at: 1,
        updated_at: 1,
    };
    server.broadcast_clipboard_record(rec.clone()).await?;

    let got1 = tokio::time::timeout(Duration::from_secs(2), ev1.recv()).await??;
    let got2 = tokio::time::timeout(Duration::from_secs(2), ev2.recv()).await??;

    let check = |ev: CoreEvent| -> AnyResult<()> {
        match ev {
            CoreEvent::RemoteClipboardRecord { record } => {
                if record.uuid != rec.uuid || record.content != rec.content {
                    return Err("收到的记录不一致".into());
                }
                Ok(())
            }
            _ => Err("收到的事件类型不正确".into()),
        }
    };

    check(got1)?;
    check(got2)?;

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
        source_device_id: "server".to_string(),
        is_remote: true,
        content: "from_server".to_string(),
        html_content: None,
        content_type: "text".to_string(),
        image_id: None,
        source_app: None,
        source_icon_hash: None,
        char_count: Some(11),
        created_at: 1,
        updated_at: 1,
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
        source_device_id: "client".to_string(),
        is_remote: false,
        content: "queued".to_string(),
        html_content: None,
        content_type: "text".to_string(),
        image_id: None,
        source_app: None,
        source_icon_hash: None,
        char_count: Some(6),
        created_at: 1,
        updated_at: 1,
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
