use std::time::Duration;

use lan_sync_core::{ClipboardRecord, ConnectionState, CoreEvent, LanSyncConfig, LanSyncManager};

type AnyResult<T> = Result<T, Box<dyn std::error::Error + Send + Sync>>;

async fn recv_remote_record(
    events: &mut tokio::sync::broadcast::Receiver<CoreEvent>,
    timeout_dur: Duration,
) -> AnyResult<ClipboardRecord> {
    let start = std::time::Instant::now();
    loop {
        let left = timeout_dur
            .checked_sub(start.elapsed())
            .unwrap_or(Duration::from_millis(0));
        if left.is_zero() {
            return Err("超时".into());
        }

        let ev = tokio::time::timeout(left, events.recv()).await??;
        if let CoreEvent::RemoteClipboardRecord { record } = ev {
            return Ok(record);
        }
    }
}

async fn ensure_no_remote_record(
    events: &mut tokio::sync::broadcast::Receiver<CoreEvent>,
    timeout_dur: Duration,
) -> AnyResult<()> {
    let start = std::time::Instant::now();
    loop {
        let left = timeout_dur
            .checked_sub(start.elapsed())
            .unwrap_or(Duration::from_millis(0));
        if left.is_zero() {
            return Ok(());
        }

        let recv_res = tokio::time::timeout(left, events.recv()).await;
        match recv_res {
            Ok(Ok(CoreEvent::RemoteClipboardRecord { .. })) => {
                return Err("不应收到回环/广播".into());
            }
            Ok(Ok(_)) => {
                // 忽略其它事件
            }
            Ok(Err(e)) => return Err(e.into()),
            Err(_) => return Ok(()),
        }
    }
}

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
        .connect_peer(&format!("ws://127.0.0.1:{}", port), false, None)
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

    let record = recv_remote_record(&mut server_events, Duration::from_secs(2)).await?;
    if record.uuid != rec.uuid || record.content != rec.content {
        return Err("收到的记录不一致".into());
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

    c1.connect_peer(&format!("ws://127.0.0.1:{}", port), false, None).await?;
    c2.connect_peer(&format!("ws://127.0.0.1:{}", port), false, None).await?;

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

    let record2 = recv_remote_record(&mut ev2, Duration::from_secs(2)).await?;
    if record2.uuid != rec.uuid || record2.content != rec.content {
        return Err("收到的记录不一致".into());
    }

    ensure_no_remote_record(&mut ev1, Duration::from_millis(200)).await?;

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

    c1.connect_peer(&format!("ws://127.0.0.1:{}", port), false, None).await?;
    c2.connect_peer(&format!("ws://127.0.0.1:{}", port), false, None).await?;

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

    let record2 = recv_remote_record(&mut ev2, Duration::from_secs(2)).await?;
    if record2.uuid != rec.uuid || record2.content != rec.content {
        return Err("收到的记录不一致".into());
    }

    ensure_no_remote_record(&mut ev1, Duration::from_millis(200)).await?;

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
        .connect_peer(&format!("ws://127.0.0.1:{}", port), false, None)
        .await?;
    client2
        .connect_peer(&format!("ws://127.0.0.1:{}", port), false, None)
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

    let record1 = recv_remote_record(&mut ev1, Duration::from_secs(2)).await?;
    let record2 = recv_remote_record(&mut ev2, Duration::from_secs(2)).await?;
    for record in [record1, record2] {
        if record.uuid != rec.uuid || record.content != rec.content {
            return Err("收到的记录不一致".into());
        }
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
        .connect_peer(&format!("ws://127.0.0.1:{}", port), false, None)
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

    let record = recv_remote_record(&mut client_events, Duration::from_secs(2)).await?;
    if record.uuid != rec.uuid || record.content != rec.content {
        return Err("收到的记录不一致".into());
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
        .connect_peer(&format!("ws://127.0.0.1:{}", port), false, None)
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

    let record = recv_remote_record(&mut server_events, Duration::from_secs(2)).await?;
    if record.uuid != rec.uuid || record.content != rec.content {
        return Err("收到的记录不一致".into());
    }

    Ok(())
}
