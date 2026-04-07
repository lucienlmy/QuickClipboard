use crate::services::lan_sync::state::{
    build_file_decision_payload, build_file_done_payload, compute_blake3_file_hash_hex, compute_transfer_proof,
    choose_preferred_transfer_mode, current_time_ms, default_supported_transfer_modes, device_id,
    emit_file_failed_event, emit_lan_chat_event, emit_outgoing_state, get_pair_secret, parse_supported_transfer_modes,
    ChatFileInfoInput, ChatFileOfferInput, ChatFileOfferPayload, ChatTransferFileStatus, ChatTransferMode,
    ChatTransferStatus, FileHttpRequest, FileHttpResponse, OutgoingChatTransfer, CHAT_FILE_OFFER_EXPIRE_MS,
    CHAT_RUNTIME, FILE_HTTP_DOWNLOAD_PATH, FILE_HTTP_PREPARE_DOWNLOAD_PATH, FILE_HTTP_PREPARE_PATH,
    FILE_HTTP_UPLOAD_PATH, MANAGER,
};
use lan_sync_core::{ChatFileDecisionMessage, ChatFileMeta, ChatFileOfferMessage, LanSyncError, LanSyncMessage};
use std::collections::HashMap;
use std::path::Path;
use uuid::Uuid;

fn log_file_transfer_debug(message: &str) {
    println!("[局域网文件调试] {message}");
}

fn log_file_transfer_error(message: &str) {
    eprintln!("[局域网文件调试] {message}");
}

fn should_fallback_to_receiver_pull(status: Option<reqwest::StatusCode>, message: &str) -> bool {
    let trimmed = message.trim();
    if trimmed.is_empty() {
        return matches!(
            status,
            Some(
                reqwest::StatusCode::NOT_FOUND
                    | reqwest::StatusCode::REQUEST_TIMEOUT
                    | reqwest::StatusCode::BAD_GATEWAY
                    | reqwest::StatusCode::SERVICE_UNAVAILABLE
                    | reqwest::StatusCode::GATEWAY_TIMEOUT
            )
        );
    }

    if matches!(
        trimmed,
        "接收方已拒绝"
            | "接收方已取消"
            | "文件传输请求已拒绝"
            | "文件传输请求已过期"
            | "传输鉴权失败"
            | "未保存对端配对信息"
            | "传输会话不存在"
            | "文件令牌无效"
            | "文件校验失败"
    ) {
        return false;
    }

    let normalized = trimmed.to_ascii_lowercase();
    matches!(
        status,
        Some(
            reqwest::StatusCode::NOT_FOUND
                | reqwest::StatusCode::REQUEST_TIMEOUT
                | reqwest::StatusCode::BAD_GATEWAY
                | reqwest::StatusCode::SERVICE_UNAVAILABLE
                | reqwest::StatusCode::GATEWAY_TIMEOUT
        )
    ) || normalized.contains("timeout")
        || normalized.contains("timed out")
        || normalized.contains("connect")
        || normalized.contains("connection")
        || normalized.contains("unreachable")
        || normalized.contains("404")
        || normalized.contains("502")
        || normalized.contains("503")
        || normalized.contains("504")
        || trimmed.contains("连接失败")
        || trimmed.contains("连接被拒绝")
        || trimmed.contains("无法连接")
        || trimmed.contains("地址不可达")
        || trimmed.contains("未找到对端文件服务")
        || trimmed.contains("访问文件服务失败")
        || trimmed.contains("不支持")
}

async fn switch_to_receiver_pull_mode(transfer_id: &str, reason: &str) -> Result<bool, String> {
    let transfer = {
        let mut runtime = CHAT_RUNTIME.lock().await;
        let Some(transfer) = runtime.outgoing_sending.get_mut(transfer_id) else {
            return Ok(false);
        };
        if transfer.selected_mode == Some(ChatTransferMode::ReceiverPull) {
            return Ok(false);
        }
        if !transfer.supported_modes.contains(&ChatTransferMode::ReceiverPull) {
            return Ok(false);
        }
        if transfer
            .file_statuses
            .values()
            .any(|status| *status != ChatTransferFileStatus::Queue)
        {
            return Ok(false);
        }

        transfer.selected_mode = Some(ChatTransferMode::ReceiverPull);
        transfer.status = ChatTransferStatus::WaitingDownload;
        for file in &transfer.files {
            transfer
                .file_statuses
                .insert(file.file_id.clone(), ChatTransferFileStatus::Queue);
            transfer.file_errors.insert(file.file_id.clone(), None);
        }
        emit_outgoing_state(transfer, Some("已切换为接收方拉取"));
        transfer.clone()
    };

    log_file_transfer_debug(&format!(
        "模式回退 transfer_id={} from={} to={} reason={}",
        transfer.transfer_id,
        ChatTransferMode::SenderPush.as_str(),
        ChatTransferMode::ReceiverPull.as_str(),
        reason
    ));
    emit_lan_chat_event(build_file_decision_payload(
        "file_accept",
        &transfer.transfer_id,
        &transfer.from_device_id,
        &transfer.to_device_id,
        Some(ChatTransferMode::ReceiverPull),
    ));
    MANAGER
        .send_message_to_device(
            &transfer.to_device_id,
            LanSyncMessage::ChatFileAccept {
                decision: ChatFileDecisionMessage {
                    transfer_id: transfer.transfer_id.clone(),
                    from_device_id: transfer.from_device_id.clone(),
                    to_device_id: transfer.to_device_id.clone(),
                    decided_at_ms: current_time_ms(),
                    selected_mode: Some(ChatTransferMode::ReceiverPull.as_str().to_string()),
                },
            },
        )
        .await
        .map_err(|error| error.to_string())?;
    Ok(true)
}

async fn write_json_response(
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
    let body = response.body.into_bytes();
    let header = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        response.status_code,
        status_text,
        body.len()
    );
    stream.write_all(header.as_bytes()).await.map_err(|e| e.to_string())?;
    stream.write_all(&body).await.map_err(|e| e.to_string())?;
    stream.flush().await.map_err(|e| e.to_string())
}

async fn negotiate_prepare_request(
    outgoing: &OutgoingChatTransfer,
    payload: &serde_json::Value,
) -> Result<(reqwest::StatusCode, String), String> {
    let urls = MANAGER
        .resolve_peer_file_server_urls(&outgoing.to_device_id, FILE_HTTP_PREPARE_PATH, &[])
        .await;
    if urls.is_empty() {
        return Err("未找到对端文件服务".to_string());
    }

    let client = reqwest::Client::new();
    let mut last_error = None;
    for (index, url) in urls.into_iter().enumerate() {
        log_file_transfer_debug(&format!(
            "prepare 尝试#{} transfer_id={} peer={} url={}",
            index + 1,
            outgoing.transfer_id,
            outgoing.to_device_id,
            url
        ));
        emit_lan_chat_event(serde_json::json!({
            "type": "file_service_probe",
            "stage": "prepare",
            "transfer_id": outgoing.transfer_id,
            "peer_device_id": outgoing.to_device_id,
            "attempt": index + 1,
            "url": url,
        }));
        if index > 0 {
            emit_lan_chat_event(serde_json::json!({
                "type": "file_service_retry",
                "peer_device_id": outgoing.to_device_id,
                "url": url,
            }));
        }

        let response = match client.post(url.clone()).json(payload).send().await {
            Ok(response) => response,
            Err(error) => {
                log_file_transfer_error(&format!(
                    "prepare 失败 transfer_id={} peer={} url={} error={}",
                    outgoing.transfer_id,
                    outgoing.to_device_id,
                    url,
                    error
                ));
                emit_lan_chat_event(serde_json::json!({
                    "type": "file_service_probe_result",
                    "stage": "prepare",
                    "transfer_id": outgoing.transfer_id,
                    "peer_device_id": outgoing.to_device_id,
                    "attempt": index + 1,
                    "url": url,
                    "ok": false,
                    "error": error.to_string(),
                }));
                last_error = Some(format!("访问文件服务失败: {error}"));
                continue;
            }
        };

        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        log_file_transfer_debug(&format!(
            "prepare 返回 transfer_id={} peer={} url={} status={} body={}",
            outgoing.transfer_id,
            outgoing.to_device_id,
            url,
            status.as_u16(),
            body
        ));
        emit_lan_chat_event(serde_json::json!({
            "type": "file_service_probe_result",
            "stage": "prepare",
            "transfer_id": outgoing.transfer_id,
            "peer_device_id": outgoing.to_device_id,
            "attempt": index + 1,
            "url": url,
            "ok": status.is_success(),
            "status": status.as_u16(),
            "body": body,
        }));
        if status.is_success() {
            return Ok((status, body));
        }

        let message = serde_json::from_str::<serde_json::Value>(&body)
            .ok()
            .and_then(|json| json.get("message").and_then(|value| value.as_str()).map(|value| value.trim().to_string()))
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| body.trim().to_string());

        let should_retry = matches!(
            message.as_str(),
            "目标设备不匹配" | "传输鉴权失败" | "未保存对端配对信息" | "传输会话不存在" | "文件令牌无效"
        ) || status == reqwest::StatusCode::NOT_FOUND;

        if should_retry {
            log_file_transfer_debug(&format!(
                "prepare 命中回退条件 transfer_id={} peer={} url={} reason={}",
                outgoing.transfer_id,
                outgoing.to_device_id,
                url,
                if message.is_empty() {
                    format!("HTTP {}", status)
                } else {
                    message.clone()
                }
            ));
            last_error = Some(if message.is_empty() {
                format!("文件协商失败: HTTP {}", status)
            } else {
                message
            });
            continue;
        }

        let rebuilt_body = if message.is_empty() {
            body
        } else {
            serde_json::json!({ "message": message }).to_string()
        };
        return Ok((status, rebuilt_body));
    }

    Err(last_error.unwrap_or_else(|| "访问对端文件服务失败".to_string()))
}

pub async fn chat_send_file_offer(input: ChatFileOfferInput) -> Result<ChatFileOfferPayload, LanSyncError> {
    if input.files.is_empty() {
        return Err(LanSyncError::Protocol("没有可发送的文件".to_string()));
    }

    let mut normalized_files = Vec::with_capacity(input.files.len());
    for f in &input.files {
        if f.file_path.trim().is_empty() {
            return Err(LanSyncError::Protocol("文件路径不能为空".to_string()));
        }
        let p = Path::new(&f.file_path);
        if !p.exists() {
            return Err(LanSyncError::Protocol(format!("文件不存在: {}", f.file_name)));
        }
        let meta = std::fs::metadata(p).map_err(|e| LanSyncError::Protocol(e.to_string()))?;
        let file_hash = compute_blake3_file_hash_hex(p).map_err(LanSyncError::Protocol)?;
        normalized_files.push(ChatFileInfoInput {
            file_id: f.file_id.clone(),
            file_name: f.file_name.clone(),
            file_size: meta.len(),
            file_path: f.file_path.clone(),
            file_hash: Some(file_hash),
        });
    }

    let transfer_id = Uuid::new_v4().to_string();
    let now = current_time_ms();
    let expire_at_ms = now.saturating_add(CHAT_FILE_OFFER_EXPIRE_MS);
    let raw_supported_modes = if input.supported_modes.is_empty() {
        default_supported_transfer_modes()
            .into_iter()
            .map(|mode| mode.as_str().to_string())
            .collect::<Vec<_>>()
    } else {
        input.supported_modes.clone()
    };
    let supported_modes = parse_supported_transfer_modes(&raw_supported_modes);
    let preferred_mode = choose_preferred_transfer_mode(&supported_modes, input.preferred_mode.as_deref());
    let offer = ChatFileOfferPayload {
        transfer_id: transfer_id.clone(),
        from_device_id: device_id(),
        to_device_id: input.to_device_id.clone(),
        text: input.text.clone().filter(|s| !s.trim().is_empty()),
        files: input
            .files
            .iter()
            .enumerate()
            .map(|(idx, f)| ChatFileMeta {
                file_id: f.file_id.clone(),
                file_name: f.file_name.clone(),
                file_size: normalized_files.get(idx).map(|x| x.file_size).unwrap_or(f.file_size),
                file_hash: normalized_files.get(idx).and_then(|x| x.file_hash.clone()),
            })
            .collect(),
        sent_at_ms: now,
        expire_at_ms,
        supported_modes: supported_modes.iter().map(|mode| mode.as_str().to_string()).collect(),
        preferred_mode: Some(preferred_mode.as_str().to_string()),
        selected_mode: None,
    };

    {
        let mut file_statuses = HashMap::new();
        let mut file_errors = HashMap::new();
        for file in &normalized_files {
            file_statuses.insert(file.file_id.clone(), ChatTransferFileStatus::Queue);
            file_errors.insert(file.file_id.clone(), None);
        }
        let mut runtime = CHAT_RUNTIME.lock().await;
        runtime.outgoing_waiting_accept.insert(
            transfer_id.clone(),
            OutgoingChatTransfer {
                transfer_id: transfer_id.clone(),
                from_device_id: offer.from_device_id.clone(),
                to_device_id: offer.to_device_id.clone(),
                text: offer.text.clone(),
                files: normalized_files,
                sent_at_ms: now,
                expire_at_ms,
                supported_modes: supported_modes.clone(),
                preferred_mode,
                selected_mode: None,
                status: ChatTransferStatus::WaitingAccept,
                file_statuses,
                file_errors,
                download_tokens: HashMap::new(),
            },
        );
    }

    if let Some(transfer) = {
        let runtime = CHAT_RUNTIME.lock().await;
        runtime.outgoing_waiting_accept.get(&transfer_id).cloned()
    } {
        emit_outgoing_state(&transfer, None);
    }

    let offer_message = ChatFileOfferMessage {
        transfer_id: offer.transfer_id.clone(),
        from_device_id: offer.from_device_id.clone(),
        to_device_id: offer.to_device_id.clone(),
        text: offer.text.clone(),
        files: offer.files.clone(),
        sent_at_ms: offer.sent_at_ms,
        expire_at_ms: offer.expire_at_ms,
        supported_modes: offer.supported_modes.clone(),
        preferred_mode: offer.preferred_mode.clone(),
    };
    MANAGER
        .send_message_to_device(
            &offer.to_device_id,
            LanSyncMessage::ChatFileOffer {
                offer: offer_message,
            },
        )
        .await?;
    Ok(offer)
}

pub async fn handle_incoming_file_accept(decision: ChatFileDecisionMessage) {
    let selected_mode = decision
        .selected_mode
        .as_deref()
        .and_then(ChatTransferMode::from_str)
        .unwrap_or(ChatTransferMode::SenderPush);

    let transfer = {
        let mut runtime = CHAT_RUNTIME.lock().await;
        let Some(mut transfer) = runtime.outgoing_waiting_accept.remove(&decision.transfer_id) else {
            return;
        };
        transfer.selected_mode = Some(selected_mode);
        transfer.status = if selected_mode == ChatTransferMode::ReceiverPull {
            ChatTransferStatus::WaitingDownload
        } else {
            ChatTransferStatus::Transferring
        };
        emit_outgoing_state(&transfer, None);
        runtime
            .outgoing_sending
            .insert(decision.transfer_id.clone(), transfer.clone());
        transfer
    };

    emit_lan_chat_event(build_file_decision_payload(
        "file_accept",
        &decision.transfer_id,
        &decision.from_device_id,
        &decision.to_device_id,
        Some(selected_mode),
    ));

    match selected_mode {
        ChatTransferMode::SenderPush => {
            tauri::async_runtime::spawn(async move {
                let _ = negotiate_and_upload_chat_files(transfer.transfer_id.clone()).await;
            });
        }
        ChatTransferMode::ReceiverPull => {
            log_file_transfer_debug(&format!(
                "等待接收方拉取 transfer_id={} peer={}",
                transfer.transfer_id, transfer.to_device_id
            ));
        }
    }
}

pub async fn handle_incoming_file_reject(decision: ChatFileDecisionMessage) {
    let mut runtime = CHAT_RUNTIME.lock().await;
    if let Some(mut transfer) = runtime.outgoing_waiting_accept.remove(&decision.transfer_id) {
        transfer.status = ChatTransferStatus::Rejected;
        emit_outgoing_state(&transfer, Some("接收方已拒绝"));
        emit_lan_chat_event(build_file_decision_payload(
            "file_reject",
            &decision.transfer_id,
            &decision.from_device_id,
            &decision.to_device_id,
            decision
                .selected_mode
                .as_deref()
                .and_then(ChatTransferMode::from_str),
        ));
    }
}

pub(super) async fn handle_http_prepare_download(body: String, remote_ip: Option<String>) -> FileHttpResponse {
    let json: serde_json::Value = match serde_json::from_str(&body) {
        Ok(value) => value,
        Err(_) => {
            return FileHttpResponse {
                status_code: 400,
                body: r#"{"message":"请求体格式错误"}"#.to_string(),
            };
        }
    };

    let transfer_id = json.get("transfer_id").and_then(|value| value.as_str()).unwrap_or("").trim().to_string();
    let from_device_id = json
        .get("from_device_id")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let to_device_id = json
        .get("to_device_id")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let proof = json.get("proof").and_then(|value| value.as_str()).unwrap_or("").trim().to_string();
    let selected_mode = json
        .get("selected_mode")
        .and_then(|value| value.as_str())
        .and_then(ChatTransferMode::from_str)
        .unwrap_or(ChatTransferMode::ReceiverPull);

    if transfer_id.is_empty() || from_device_id.is_empty() || to_device_id.is_empty() || proof.is_empty() {
        return FileHttpResponse {
            status_code: 400,
            body: r#"{"message":"缺少必要参数"}"#.to_string(),
        };
    }
    if to_device_id != device_id() {
        return FileHttpResponse {
            status_code: 403,
            body: r#"{"message":"目标设备不匹配"}"#.to_string(),
        };
    }

    let Some(pair_secret) = get_pair_secret(&from_device_id) else {
        return FileHttpResponse {
            status_code: 403,
            body: r#"{"message":"未保存对端配对信息"}"#.to_string(),
        };
    };
    let Ok(expected_proof) = compute_transfer_proof(&pair_secret, &from_device_id, &transfer_id) else {
        return FileHttpResponse {
            status_code: 403,
            body: r#"{"message":"传输鉴权失败"}"#.to_string(),
        };
    };
    if !expected_proof.eq_ignore_ascii_case(&proof) {
        return FileHttpResponse {
            status_code: 403,
            body: r#"{"message":"传输鉴权失败"}"#.to_string(),
        };
    }
    if let Some(ip) = remote_ip {
        MANAGER
            .remember_peer_file_server(&from_device_id, Some(ip), None, &[])
            .await;
    }

    let files = {
        let mut runtime = CHAT_RUNTIME.lock().await;
        let Some(transfer) = runtime.outgoing_sending.get_mut(&transfer_id) else {
            return FileHttpResponse {
                status_code: 409,
                body: r#"{"message":"传输会话不存在"}"#.to_string(),
            };
        };
        if transfer.from_device_id != to_device_id || transfer.to_device_id != from_device_id {
            return FileHttpResponse {
                status_code: 403,
                body: r#"{"message":"传输双方不匹配"}"#.to_string(),
            };
        }
        if transfer.selected_mode != Some(ChatTransferMode::ReceiverPull) || selected_mode != ChatTransferMode::ReceiverPull {
            return FileHttpResponse {
                status_code: 409,
                body: r#"{"message":"当前传输模式不支持拉取"}"#.to_string(),
            };
        }

        let mut files = Vec::with_capacity(transfer.files.len());
        for file in &transfer.files {
            let token = transfer
                .download_tokens
                .entry(file.file_id.clone())
                .or_insert_with(|| Uuid::new_v4().to_string())
                .clone();
            files.push(serde_json::json!({
                "file_id": file.file_id,
                "download_token": token,
                "file_size": file.file_size,
                "file_hash": file.file_hash,
            }));
        }
        transfer.status = ChatTransferStatus::Transferring;
        emit_outgoing_state(transfer, None);
        files
    };

    log_file_transfer_debug(&format!(
        "prepare-download 响应 transfer_id={} from={} to={} files={} via={}",
        transfer_id,
        from_device_id,
        to_device_id,
        files.len(),
        FILE_HTTP_PREPARE_DOWNLOAD_PATH
    ));

    FileHttpResponse {
        status_code: 200,
        body: serde_json::json!({
            "transfer_id": transfer_id,
            "selected_mode": ChatTransferMode::ReceiverPull.as_str(),
            "files": files,
        })
        .to_string(),
    }
}

pub(super) async fn handle_http_download(
    stream: &mut tokio::net::TcpStream,
    request: FileHttpRequest,
    _remote_ip: Option<String>,
) -> Result<(), String> {
    use tokio::io::AsyncWriteExt;

    let transfer_id = request.query.get("transfer_id").cloned().unwrap_or_default();
    let file_id = request.query.get("file_id").cloned().unwrap_or_default();
    let token = request.query.get("token").cloned().unwrap_or_default();
    if transfer_id.trim().is_empty() || file_id.trim().is_empty() || token.trim().is_empty() {
        return write_json_response(
            stream,
            FileHttpResponse {
                status_code: 400,
                body: r#"{"message":"缺少下载参数"}"#.to_string(),
            },
        )
        .await;
    }

    let (file_path, file_size, from_device_id, to_device_id, total_size, sent_before) = {
        let runtime = CHAT_RUNTIME.lock().await;
        let Some(transfer) = runtime.outgoing_sending.get(&transfer_id) else {
            return write_json_response(
                stream,
                FileHttpResponse {
                    status_code: 409,
                    body: r#"{"message":"传输会话不存在"}"#.to_string(),
                },
            )
            .await;
        };
        let Some(file) = transfer.files.iter().find(|file| file.file_id == file_id) else {
            return write_json_response(
                stream,
                FileHttpResponse {
                    status_code: 404,
                    body: r#"{"message":"传输文件不存在"}"#.to_string(),
                },
            )
            .await;
        };
        let expected_token = transfer.download_tokens.get(&file_id).cloned().unwrap_or_default();
        if expected_token != token {
            return write_json_response(
                stream,
                FileHttpResponse {
                    status_code: 403,
                    body: r#"{"message":"下载令牌无效"}"#.to_string(),
                },
            )
            .await;
        }
        let total_size = transfer.files.iter().map(|item| item.file_size).sum::<u64>();
        let sent_before = transfer
            .files
            .iter()
            .take_while(|item| item.file_id != file_id)
            .map(|item| {
                if transfer.file_statuses.get(&item.file_id).copied() == Some(ChatTransferFileStatus::Done) {
                    item.file_size
                } else {
                    0
                }
            })
            .sum::<u64>();
        (
            file.file_path.clone(),
            file.file_size,
            transfer.from_device_id.clone(),
            transfer.to_device_id.clone(),
            total_size,
            sent_before,
        )
    };

    log_file_transfer_debug(&format!(
        "download 请求 transfer_id={} file_id={} via={}",
        transfer_id, file_id, FILE_HTTP_DOWNLOAD_PATH
    ));

    let mut file = match tokio::fs::File::open(&file_path).await {
        Ok(file) => file,
        Err(error) => {
            log_file_transfer_error(&format!(
                "download 打开文件失败 transfer_id={} file_id={} path={} error={}",
                transfer_id, file_id, file_path, error
            ));
            return write_json_response(
                stream,
                FileHttpResponse {
                    status_code: 500,
                    body: format!(r#"{{"message":"{}"}}"#, error.to_string().replace('"', "'")),
                },
            )
            .await;
        }
    };

    let header = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        file_size
    );
    stream.write_all(header.as_bytes()).await.map_err(|e| e.to_string())?;
    let mut buffer = vec![0u8; 64 * 1024];
    let mut streamed = 0u64;
    loop {
        let read = tokio::io::AsyncReadExt::read(&mut file, &mut buffer)
            .await
            .map_err(|e| e.to_string())?;
        if read == 0 {
            break;
        }
        stream.write_all(&buffer[..read]).await.map_err(|e| e.to_string())?;
        streamed = streamed.saturating_add(read as u64);
        emit_lan_chat_event(serde_json::json!({
            "type": "file_progress",
            "transfer_id": transfer_id,
            "sent_size": sent_before.saturating_add(streamed),
            "total_size": total_size,
        }));
    }
    stream.flush().await.map_err(|e| e.to_string())?;

    let transfer_done = {
        let mut runtime = CHAT_RUNTIME.lock().await;
        let Some(transfer) = runtime.outgoing_sending.get_mut(&transfer_id) else {
            return Ok(());
        };
        transfer
            .file_statuses
            .insert(file_id.clone(), ChatTransferFileStatus::Done);
        transfer.file_errors.insert(file_id.clone(), None);
        let transfer_done = transfer
            .files
            .iter()
            .all(|item| transfer.file_statuses.get(&item.file_id).copied() == Some(ChatTransferFileStatus::Done));
        if transfer_done {
            transfer.status = ChatTransferStatus::Done;
        }
        emit_outgoing_state(transfer, None);
        transfer_done
    };

    let mut runtime = CHAT_RUNTIME.lock().await;
    if transfer_done {
        if runtime.outgoing_sending.remove(&transfer_id).is_some() {
            emit_lan_chat_event(build_file_done_payload(
                &transfer_id,
                &from_device_id,
                &to_device_id,
                None,
            ));
        }
    }

    log_file_transfer_debug(&format!(
        "download 成功 transfer_id={} file_id={} path={} via={}",
        transfer_id, file_id, file_path, FILE_HTTP_DOWNLOAD_PATH
    ));
    Ok(())
}

async fn negotiate_and_upload_chat_files(transfer_id: String) -> Result<(), String> {
    let outgoing = {
        let runtime = CHAT_RUNTIME.lock().await;
        runtime
            .outgoing_sending
            .get(&transfer_id)
            .cloned()
            .or_else(|| runtime.outgoing_waiting_accept.get(&transfer_id).cloned())
    }
    .ok_or_else(|| "传输任务不存在".to_string())?;

    if current_time_ms() > outgoing.expire_at_ms {
        let mut runtime = CHAT_RUNTIME.lock().await;
        if let Some(mut transfer) = runtime.outgoing_waiting_accept.remove(&transfer_id) {
            transfer.status = ChatTransferStatus::Expired;
            emit_outgoing_state(&transfer, Some("文件传输请求已过期"));
            emit_lan_chat_event(build_file_decision_payload(
                "file_expired",
                &transfer_id,
                &outgoing.to_device_id,
                &outgoing.from_device_id,
                outgoing.selected_mode,
            ));
        }
        return Err("文件传输请求已过期".to_string());
    }

    log_file_transfer_debug(&format!(
        "模式尝试 transfer_id={} mode={}",
        transfer_id,
        outgoing
            .selected_mode
            .unwrap_or(ChatTransferMode::SenderPush)
            .as_str()
    ));

    let pair_secret = get_pair_secret(&outgoing.to_device_id)
        .ok_or_else(|| "未保存对端配对信息".to_string())?;
    let proof = compute_transfer_proof(&pair_secret, &outgoing.from_device_id, &outgoing.transfer_id)?;

    let mut payload = serde_json::Map::new();
    payload.insert("transfer_id".to_string(), serde_json::json!(outgoing.transfer_id));
    payload.insert("from_device_id".to_string(), serde_json::json!(outgoing.from_device_id));
    payload.insert("to_device_id".to_string(), serde_json::json!(outgoing.to_device_id));
    payload.insert(
        "supported_modes".to_string(),
        serde_json::json!(outgoing.supported_modes.iter().map(|mode| mode.as_str()).collect::<Vec<_>>()),
    );
    payload.insert(
        "preferred_mode".to_string(),
        serde_json::json!(outgoing.preferred_mode.as_str()),
    );
    if let Some(selected_mode) = outgoing.selected_mode {
        payload.insert("selected_mode".to_string(), serde_json::json!(selected_mode.as_str()));
    }
    if let Some(text) = outgoing.text.as_ref().filter(|value| !value.trim().is_empty()) {
        payload.insert("text".to_string(), serde_json::json!(text));
    }
    payload.insert("sent_at_ms".to_string(), serde_json::json!(outgoing.sent_at_ms));
    payload.insert("expire_at_ms".to_string(), serde_json::json!(outgoing.expire_at_ms));
    payload.insert("proof".to_string(), serde_json::json!(proof));
    payload.insert(
        "files".to_string(),
        serde_json::json!(outgoing.files.iter().map(|file| {
            serde_json::json!({
                "file_id": file.file_id,
                "file_name": file.file_name,
                "file_size": file.file_size,
                "file_hash": file.file_hash,
            })
        }).collect::<Vec<_>>()),
    );
    let payload = serde_json::Value::Object(payload);

    let (status, body) = match negotiate_prepare_request(&outgoing, &payload).await {
        Ok(result) => result,
        Err(error) => {
            if should_fallback_to_receiver_pull(None, &error)
                && switch_to_receiver_pull_mode(&transfer_id, &error).await?
            {
                return Ok(());
            }
            let mut runtime = CHAT_RUNTIME.lock().await;
            if let Some(mut transfer) = runtime
                .outgoing_waiting_accept
                .remove(&transfer_id)
                .or_else(|| runtime.outgoing_sending.remove(&transfer_id))
            {
                if transfer.status.is_canceled() {
                    return Ok(());
                }
                transfer.status = ChatTransferStatus::Failed;
                for file in &transfer.files {
                    transfer
                        .file_statuses
                        .insert(file.file_id.clone(), ChatTransferFileStatus::Failed);
                    transfer.file_errors.insert(file.file_id.clone(), Some(error.clone()));
                }
                emit_outgoing_state(&transfer, Some(&error));
                emit_file_failed_event(&transfer_id, &transfer.from_device_id, &transfer.to_device_id, &error);
            }
            return Err(error);
        }
    };

    if status == reqwest::StatusCode::FORBIDDEN {
        let mut runtime = CHAT_RUNTIME.lock().await;
        if let Some(mut transfer) = runtime
            .outgoing_waiting_accept
            .remove(&transfer_id)
            .or_else(|| runtime.outgoing_sending.remove(&transfer_id))
        {
            if transfer.status.is_canceled() {
                return Ok(());
            }
            transfer.status = ChatTransferStatus::Rejected;
            emit_outgoing_state(&transfer, Some("接收方已拒绝"));
            emit_lan_chat_event(build_file_decision_payload(
                "file_reject",
                &transfer_id,
                &outgoing.to_device_id,
                &outgoing.from_device_id,
                transfer.selected_mode,
            ));
        }
        return Err("接收方已拒绝".to_string());
    }

    if status == reqwest::StatusCode::CONFLICT {
        let mut runtime = CHAT_RUNTIME.lock().await;
        if let Some(mut transfer) = runtime
            .outgoing_waiting_accept
            .remove(&transfer_id)
            .or_else(|| runtime.outgoing_sending.remove(&transfer_id))
        {
            if transfer.status.is_canceled() {
                return Ok(());
            }
            transfer.status = ChatTransferStatus::CanceledByReceiver;
            for file in &transfer.files {
                transfer
                    .file_statuses
                    .insert(file.file_id.clone(), ChatTransferFileStatus::Canceled);
                transfer
                    .file_errors
                    .insert(file.file_id.clone(), Some("接收方已取消".to_string()));
            }
            emit_outgoing_state(&transfer, Some("接收方已取消"));
        }
        return Err("接收方已取消".to_string());
    }

    if !status.is_success() {
        let message = serde_json::from_str::<serde_json::Value>(&body)
            .ok()
            .and_then(|json| json.get("message").and_then(|value| value.as_str()).map(|value| value.to_string()))
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| if body.trim().is_empty() { "文件协商失败".to_string() } else { body.clone() });
        if should_fallback_to_receiver_pull(Some(status), &message)
            && switch_to_receiver_pull_mode(&transfer_id, &message).await?
        {
            return Ok(());
        }
        let mut runtime = CHAT_RUNTIME.lock().await;
        if let Some(mut transfer) = runtime
            .outgoing_waiting_accept
            .remove(&transfer_id)
            .or_else(|| runtime.outgoing_sending.remove(&transfer_id))
        {
            if transfer.status.is_canceled() {
                return Ok(());
            }
            transfer.status = ChatTransferStatus::Failed;
            for file in &transfer.files {
                transfer
                    .file_statuses
                    .insert(file.file_id.clone(), ChatTransferFileStatus::Failed);
                transfer.file_errors.insert(file.file_id.clone(), Some(message.clone()));
            }
            emit_outgoing_state(&transfer, Some(&message));
            emit_file_failed_event(&transfer_id, &transfer.from_device_id, &transfer.to_device_id, &message);
        }
        return Err(message);
    }

    let json: serde_json::Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
    let response_mode = json
        .get("selected_mode")
        .and_then(|value| value.as_str())
        .and_then(ChatTransferMode::from_str)
        .unwrap_or(outgoing.selected_mode.unwrap_or(ChatTransferMode::SenderPush));
    if response_mode == ChatTransferMode::ReceiverPull {
        let mut runtime = CHAT_RUNTIME.lock().await;
        if let Some(transfer) = runtime.outgoing_sending.get_mut(&transfer_id) {
            if transfer.status.is_canceled() {
                return Ok(());
            }
            transfer.selected_mode = Some(ChatTransferMode::ReceiverPull);
            transfer.status = ChatTransferStatus::WaitingDownload;
            for file in &transfer.files {
                transfer
                    .file_statuses
                    .insert(file.file_id.clone(), ChatTransferFileStatus::Queue);
                transfer.file_errors.insert(file.file_id.clone(), None);
            }
            emit_outgoing_state(transfer, None);
        } else {
            return Ok(());
        }
        log_file_transfer_debug(&format!(
            "prepare 返回改选模式 transfer_id={} from={} to={}",
            transfer_id,
            ChatTransferMode::SenderPush.as_str(),
            ChatTransferMode::ReceiverPull.as_str()
        ));
        emit_lan_chat_event(build_file_decision_payload(
            "file_accept",
            &transfer_id,
            &outgoing.to_device_id,
            &outgoing.from_device_id,
            Some(ChatTransferMode::ReceiverPull),
        ));
        return Ok(());
    }

    let mut accepted_files = HashMap::new();
    if let Some(files) = json.get("files").and_then(|value| value.as_array()) {
        for item in files {
            let file_id = item.get("file_id").and_then(|value| value.as_str()).unwrap_or("").trim();
            let upload_token = item
                .get("upload_token")
                .and_then(|value| value.as_str())
                .unwrap_or("")
                .trim();
            if !file_id.is_empty() && !upload_token.is_empty() {
                accepted_files.insert(file_id.to_string(), upload_token.to_string());
            }
        }
    }

    {
        let mut runtime = CHAT_RUNTIME.lock().await;
        if let Some(transfer) = runtime.outgoing_sending.get_mut(&transfer_id) {
            if transfer.status.is_canceled() {
                return Ok(());
            }
            transfer.status = ChatTransferStatus::Transferring;
            emit_outgoing_state(transfer, None);
        } else {
            return Ok(());
        }
    }
    emit_lan_chat_event(build_file_decision_payload(
        "file_accept",
        &transfer_id,
        &outgoing.to_device_id,
        &outgoing.from_device_id,
        outgoing.selected_mode,
    ));

    let total_size = outgoing.files.iter().map(|file| file.file_size).sum::<u64>();
    let mut sent_size = 0u64;
    let mut has_failed_file = false;

    for file in &outgoing.files {
        let token = accepted_files
            .get(&file.file_id)
            .cloned()
            .ok_or_else(|| format!("缺少文件上传令牌: {}", file.file_name))?;
        {
            let mut runtime = CHAT_RUNTIME.lock().await;
            let Some(transfer) = runtime.outgoing_sending.get_mut(&transfer_id) else {
                return Ok(());
            };
            if transfer.status.is_canceled() {
                return Ok(());
            }
            transfer
                .file_statuses
                .insert(file.file_id.clone(), ChatTransferFileStatus::Transferring);
            transfer.file_errors.insert(file.file_id.clone(), None);
            emit_outgoing_state(transfer, None);
        }

        let file_id = file.file_id.clone();
        let file_name = file.file_name.clone();
        let file_size = file.file_size;
        let upload_urls = MANAGER
            .resolve_peer_file_server_urls(
                &outgoing.to_device_id,
                FILE_HTTP_UPLOAD_PATH,
                &[
                    ("transfer_id".to_string(), outgoing.transfer_id.clone()),
                    ("file_id".to_string(), file_id),
                    ("token".to_string(), token),
                ],
            )
            .await;
        if upload_urls.is_empty() {
            return Err("未找到对端文件上传地址".to_string());
        }

        let file_path = file.file_path.clone();
        let transfer_id_for_emit = outgoing.transfer_id.clone();
        let from_device_id_for_emit = outgoing.from_device_id.clone();
        let to_device_id_for_emit = outgoing.to_device_id.clone();
        let to_device_id_for_task = to_device_id_for_emit.clone();
        let sent_size_before = sent_size;
        let upload_result = tauri::async_runtime::spawn_blocking(move || -> Result<u64, String> {
            use std::io::Read;

            struct ProgressReader {
                inner: std::fs::File,
                transfer_id: String,
                sent_base: u64,
                sent_total: u64,
                total_size: u64,
            }

            impl Read for ProgressReader {
                fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
                    let read = self.inner.read(buf)?;
                    if read > 0 {
                        self.sent_total = self.sent_total.saturating_add(read as u64);
                        emit_lan_chat_event(serde_json::json!({
                            "type": "file_progress",
                            "transfer_id": self.transfer_id,
                            "sent_size": self.sent_base.saturating_add(self.sent_total),
                            "total_size": self.total_size,
                        }));
                    }
                    Ok(read)
                }
            }

            let client = reqwest::blocking::Client::new();
            let mut last_error = None;
            for (index, upload_url) in upload_urls.into_iter().enumerate() {
                log_file_transfer_debug(&format!(
                    "upload 尝试#{} transfer_id={} peer={} file={} url={}",
                    index + 1,
                    transfer_id_for_emit,
                    to_device_id_for_task,
                    file_name,
                    upload_url
                ));
                emit_lan_chat_event(serde_json::json!({
                    "type": "file_service_probe",
                    "stage": "upload",
                        "transfer_id": transfer_id_for_emit,
                        "peer_device_id": to_device_id_for_task,
                        "attempt": index + 1,
                        "file_name": file_name,
                        "url": upload_url,
                    }));
                if index > 0 {
                    emit_lan_chat_event(serde_json::json!({
                        "type": "file_service_retry",
                        "transfer_id": transfer_id_for_emit,
                        "file_name": file_name,
                        "url": upload_url,
                    }));
                }
                let raw_file = std::fs::File::open(&file_path).map_err(|e| e.to_string())?;
                let reader = ProgressReader {
                    inner: raw_file,
                    transfer_id: transfer_id_for_emit.clone(),
                    sent_base: sent_size_before,
                    sent_total: 0,
                    total_size,
                };
                let response = client
                    .post(&upload_url)
                    .header(reqwest::header::CONTENT_LENGTH, file_size)
                    .body(reqwest::blocking::Body::new(reader))
                    .send();

                match response {
                    Ok(response) if response.status().is_success() => {
                        log_file_transfer_debug(&format!(
                            "upload 成功 transfer_id={} peer={} file={} url={} status={}",
                            transfer_id_for_emit,
                            to_device_id_for_task,
                            file_name,
                            upload_url,
                            response.status().as_u16()
                        ));
                        emit_lan_chat_event(serde_json::json!({
                            "type": "file_service_probe_result",
                            "stage": "upload",
                            "transfer_id": transfer_id_for_emit,
                            "peer_device_id": to_device_id_for_task,
                            "attempt": index + 1,
                            "file_name": file_name,
                            "url": upload_url,
                            "ok": true,
                            "status": response.status().as_u16(),
                        }));
                        return Ok(file_size)
                    },
                    Ok(response) => {
                        let status = response.status().as_u16();
                        let body = response
                            .text()
                            .unwrap_or_else(|_| format!("文件上传失败: {file_name}"));
                        log_file_transfer_error(&format!(
                            "upload 失败 transfer_id={} peer={} file={} url={} status={} body={}",
                            transfer_id_for_emit,
                            to_device_id_for_task,
                            file_name,
                            upload_url,
                            status,
                            body
                        ));
                        emit_lan_chat_event(serde_json::json!({
                            "type": "file_service_probe_result",
                            "stage": "upload",
                            "transfer_id": transfer_id_for_emit,
                            "peer_device_id": to_device_id_for_task,
                            "attempt": index + 1,
                            "file_name": file_name,
                            "url": upload_url,
                            "ok": false,
                            "status": status,
                            "body": body,
                        }));
                        last_error = Some(
                            body,
                        );
                    }
                    Err(error) => {
                        log_file_transfer_error(&format!(
                            "upload 请求异常 transfer_id={} peer={} file={} url={} error={}",
                            transfer_id_for_emit,
                            to_device_id_for_task,
                            file_name,
                            upload_url,
                            error
                        ));
                        emit_lan_chat_event(serde_json::json!({
                            "type": "file_service_probe_result",
                            "stage": "upload",
                            "transfer_id": transfer_id_for_emit,
                            "peer_device_id": to_device_id_for_task,
                            "attempt": index + 1,
                            "file_name": file_name,
                            "url": upload_url,
                            "ok": false,
                            "error": error.to_string(),
                        }));
                        last_error = Some(error.to_string());
                    }
                }
            }
            Err(last_error.unwrap_or_else(|| format!("文件上传失败: {file_name}")))
        })
        .await
        .map_err(|e| e.to_string())?;

        match upload_result {
            Ok(uploaded) => {
                sent_size = sent_size.saturating_add(uploaded);
                let mut runtime = CHAT_RUNTIME.lock().await;
                if let Some(transfer) = runtime.outgoing_sending.get_mut(&transfer_id) {
                    transfer
                        .file_statuses
                        .insert(file.file_id.clone(), ChatTransferFileStatus::Done);
                    transfer.file_errors.insert(file.file_id.clone(), None);
                    emit_outgoing_state(transfer, None);
                }
            }
            Err(error) => {
                has_failed_file = true;
                let mut runtime = CHAT_RUNTIME.lock().await;
                if let Some(transfer) = runtime.outgoing_sending.get_mut(&transfer_id) {
                    if transfer.status.is_canceled() {
                        return Ok(());
                    }
                    transfer
                        .file_statuses
                        .insert(file.file_id.clone(), ChatTransferFileStatus::Failed);
                    transfer.file_errors.insert(file.file_id.clone(), Some(error.clone()));
                    emit_outgoing_state(transfer, Some(&error));
                }
                emit_file_failed_event(&transfer_id, &from_device_id_for_emit, &to_device_id_for_emit, &error);
            }
        }
    }

    let mut runtime = CHAT_RUNTIME.lock().await;
    if let Some(mut transfer) = runtime.outgoing_sending.remove(&transfer_id) {
        if transfer.status.is_canceled() {
            return Ok(());
        }
        transfer.status = if has_failed_file {
            ChatTransferStatus::Partial
        } else {
            ChatTransferStatus::Done
        };
        emit_outgoing_state(&transfer, None);
        emit_lan_chat_event(build_file_done_payload(
            &transfer_id,
            &transfer.from_device_id,
            &transfer.to_device_id,
            None,
        ));
    }
    Ok(())
}
