use std::time::Duration;

use lan_sync_core::{ConnectionState, LanSyncConfig, LanSyncManager};

type AnyResult<T> = Result<T, Box<dyn std::error::Error + Send + Sync>>;

async fn wait_until_async<F, Fut>(timeout_dur: Duration, mut f: F) -> AnyResult<()>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = bool>,
{
    let start = std::time::Instant::now();
    loop {
        if f().await {
            return Ok(());
        }
        if start.elapsed() > timeout_dur {
            return Err("超时".into());
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
}

fn mk_mgr(device_id: &str) -> LanSyncManager {
    LanSyncManager::new(LanSyncConfig {
        device_id: device_id.to_string(),
        protocol_version: 1,
        ping_interval: Duration::from_secs(2),
        idle_timeout: Duration::from_secs(8),
        respond_to_ping: true,
        connect_timeout: Duration::from_secs(2),
    })
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn ping_keeps_connection_alive() -> AnyResult<()> {
    let server = mk_mgr("server");
    server.set_enabled(true).await;
    let port = server.start_server(0).await?;

    let client = LanSyncManager::new(LanSyncConfig {
        device_id: "client".to_string(),
        protocol_version: 1,
        ping_interval: Duration::from_millis(50),
        idle_timeout: Duration::from_millis(200),
        respond_to_ping: true,
        connect_timeout: Duration::from_secs(2),
    });
    client.set_enabled(true).await;
    client
        .connect_peer(&format!("ws://127.0.0.1:{}", port), false)
        .await?;

    wait_until_async(Duration::from_secs(2), || async {
        client.get_snapshot().await.state == ConnectionState::Connected
    })
    .await?;

    tokio::time::sleep(Duration::from_millis(350)).await;
    let snap = client.get_snapshot().await;
    if snap.state != ConnectionState::Connected {
        return Err("未处于已连接状态".into());
    }

    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn server_snapshot_tracks_multiple_peers() -> AnyResult<()> {
    let server = mk_mgr("server");
    server.set_enabled(true).await;
    let port = server.start_server(0).await?;
    let url = format!("ws://127.0.0.1:{}", port);

    let c1 = mk_mgr("c1");
    let c2 = mk_mgr("c2");
    c1.set_enabled(true).await;
    c2.set_enabled(true).await;

    c1.connect_peer(&url, false).await?;
    c2.connect_peer(&url, false).await?;

    wait_until_async(Duration::from_secs(2), || async {
        let snap = server.get_snapshot().await;
        snap.server_connected_count == 2
            && snap.server_connected_device_ids.contains(&"c1".to_string())
            && snap.server_connected_device_ids.contains(&"c2".to_string())
    })
    .await?;

    c1.set_enabled(false).await;

    wait_until_async(Duration::from_secs(2), || async {
        let snap = server.get_snapshot().await;
        snap.server_connected_count == 1
            && !snap.server_connected_device_ids.contains(&"c1".to_string())
    })
    .await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn auto_reconnect_recovers() -> AnyResult<()> {
    let client = LanSyncManager::new(LanSyncConfig {
        device_id: "client".to_string(),
        protocol_version: 1,
        ping_interval: Duration::from_secs(2),
        idle_timeout: Duration::from_secs(8),
        respond_to_ping: true,
        connect_timeout: Duration::from_millis(100),
    });
    client.set_enabled(true).await;

    let temp = tokio::net::TcpListener::bind(("127.0.0.1", 0)).await?;
    let port = temp.local_addr()?.port();
    drop(temp);

    let url = format!("ws://127.0.0.1:{}", port);
    client.connect_peer(&url, true).await?;

    wait_until_async(Duration::from_secs(2), || async {
        let snap = client.get_snapshot().await;
        snap.reconnecting && snap.reconnect_attempt > 0 && snap.next_retry_in_ms.is_some()
    })
    .await?;

    tokio::time::sleep(Duration::from_millis(200)).await;

    let server = mk_mgr("server");
    server.set_enabled(true).await;
    let bound = server.start_server(port).await?;
    if bound != port {
        return Err("端口不一致".into());
    }

    wait_until_async(Duration::from_secs(3), || async {
        client.get_snapshot().await.state == ConnectionState::Connected
    })
    .await?;

    let snap = client.get_snapshot().await;
    if snap.next_retry_in_ms.is_some() {
        return Err("重试倒计时未清理".into());
    }

    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn manual_disconnect_prevents_reconnect() -> AnyResult<()> {
    let server = mk_mgr("server");
    server.set_enabled(true).await;
    let port = server.start_server(0).await?;

    let client = mk_mgr("client");
    client.set_enabled(true).await;
    let url = format!("ws://127.0.0.1:{}", port);
    client.connect_peer(&url, true).await?;

    wait_until_async(Duration::from_secs(2), || async {
        client.get_snapshot().await.state == ConnectionState::Connected
    })
    .await?;

    client.disconnect_peer().await;

    tokio::time::sleep(Duration::from_millis(800)).await;
    let snap = client.get_snapshot().await;
    if snap.state != ConnectionState::Disconnected {
        return Err("未处于已断开状态".into());
    }

    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn connect_success() -> AnyResult<()> {
    let server = mk_mgr("server");
    let client = mk_mgr("client");

    server.set_enabled(true).await;
    client.set_enabled(true).await;

    let port = server.start_server(0).await?;
    client
        .connect_peer(&format!("ws://127.0.0.1:{}", port), false)
        .await?;

    wait_until_async(Duration::from_secs(2), || async {
        client.get_snapshot().await.state == ConnectionState::Connected
    })
    .await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn no_deadlock_under_load() -> AnyResult<()> {
    let server = mk_mgr("server");
    server.set_enabled(true).await;
    let port = server.start_server(0).await?;
    let url = format!("ws://127.0.0.1:{}", port);

    tokio::time::timeout(Duration::from_secs(5), async {
        for i in 0..20u32 {
            let client = mk_mgr(&format!("c{}", i));
            client.set_enabled(true).await;
            client.connect_peer(&url, false).await?;

            wait_until_async(Duration::from_secs(2), || async {
                client.get_snapshot().await.state == ConnectionState::Connected
            })
            .await?;

            client.set_enabled(false).await;
        }
        AnyResult::<()>::Ok(())
    })
    .await
    .map_err(|_| -> Box<dyn std::error::Error + Send + Sync> { "超时".into() })??;

    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn kick_old_keep_new() -> AnyResult<()> {
    let server = mk_mgr("server");
    let client1 = mk_mgr("dup");
    let client2 = mk_mgr("dup");

    server.set_enabled(true).await;
    client1.set_enabled(true).await;
    client2.set_enabled(true).await;

    let port = server.start_server(0).await?;
    let url = format!("ws://127.0.0.1:{}", port);

    client1.connect_peer(&url, false).await?;
    wait_until_async(Duration::from_secs(2), || async {
        client1.get_snapshot().await.state == ConnectionState::Connected
    })
    .await?;

    client2.connect_peer(&url, false).await?;
    wait_until_async(Duration::from_secs(2), || async {
        client2.get_snapshot().await.state == ConnectionState::Connected
    })
    .await?;

    wait_until_async(Duration::from_secs(2), || async {
        client1.get_snapshot().await.state == ConnectionState::Disconnected
    })
    .await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn disconnect_detected() -> AnyResult<()> {
    let server = mk_mgr("server");
    let client = mk_mgr("client");

    server.set_enabled(true).await;
    client.set_enabled(true).await;

    let port = server.start_server(0).await?;
    client
        .connect_peer(&format!("ws://127.0.0.1:{}", port), false)
        .await?;

    wait_until_async(Duration::from_secs(2), || async {
        client.get_snapshot().await.state == ConnectionState::Connected
    })
    .await?;

    client.set_enabled(false).await;

    wait_until_async(Duration::from_secs(2), || async {
        let snap = server.get_snapshot().await;
        snap.state == ConnectionState::Listening && snap.server_connected_count == 0
    })
    .await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn reconnect_after_disconnect() -> AnyResult<()> {
    let server = mk_mgr("server");
    let client = mk_mgr("client");

    server.set_enabled(true).await;
    client.set_enabled(true).await;

    let port = server.start_server(0).await?;
    let url = format!("ws://127.0.0.1:{}", port);

    client.connect_peer(&url, false).await?;

    wait_until_async(Duration::from_secs(2), || async {
        client.get_snapshot().await.state == ConnectionState::Connected
    })
    .await?;

    client.set_enabled(false).await;
    client.set_enabled(true).await;

    client.connect_peer(&url, false).await?;

    wait_until_async(Duration::from_secs(2), || async {
        client.get_snapshot().await.state == ConnectionState::Connected
    })
    .await?;

    Ok(())
}
