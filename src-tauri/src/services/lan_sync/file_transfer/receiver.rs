use crate::services::lan_sync::state::{
    build_file_decision_payload, build_file_done_payload, build_unique_file_path, compute_blake3_file_hash_hex,
    compute_transfer_proof, current_time_ms, device_id, emit_file_failed_event, emit_incoming_offer_state,
    emit_incoming_receive_state, emit_lan_chat_event, emit_outgoing_state, get_chat_receive_dir, get_pair_secret,
    ChatTransferFileStatus, ChatTransferMode, ChatTransferStatus, FileHttpRequest, FileHttpResponse,
    IncomingChatTransfer, IncomingDecision, IncomingReceiveProgress, ReceiveFileProgress, ChatFileOfferPayload,
    CHAT_FILE_OFFER_EXPIRE_MS, CHAT_RUNTIME, FILE_HTTP_IO_BUFFER_SIZE, MANAGER,
};
use lan_sync_core::{ChatFileCancelMessage, ChatFileMeta, ChatFileOfferMessage};
use std::collections::HashSet;
use std::time::Duration;
use uuid::Uuid;

pub async fn handle_incoming_file_offer_message(offer: ChatFileOfferMessage) {
    let supported_modes = crate::services::lan_sync::state::parse_supported_transfer_modes(&offer.supported_modes);
    let preferred_mode = crate::services::lan_sync::state::choose_preferred_transfer_mode(
        &supported_modes,
        offer.preferred_mode.as_deref(),
    );
    let payload = ChatFileOfferPayload {
        transfer_id: offer.transfer_id.clone(),
        from_device_id: offer.from_device_id.clone(),
        to_device_id: offer.to_device_id.clone(),
        text: offer.text.clone(),
        files: offer.files.clone(),
        sent_at_ms: offer.sent_at_ms,
        expire_at_ms: offer.expire_at_ms,
        supported_modes: supported_modes.iter().map(|mode| mode.as_str().to_string()).collect(),
        preferred_mode: Some(preferred_mode.as_str().to_string()),
        selected_mode: None,
    };

    {
        let mut runtime = CHAT_RUNTIME.lock().await;
        runtime.incoming_waiting_decision.insert(
            offer.transfer_id.clone(),
            IncomingChatTransfer {
                transfer_id: offer.transfer_id.clone(),
                from_device_id: offer.from_device_id.clone(),
                to_device_id: offer.to_device_id.clone(),
                text: offer.text,
                files: offer.files,
                sent_at_ms: offer.sent_at_ms,
                expire_at_ms: offer.expire_at_ms,
                supported_modes,
                preferred_mode,
                selected_mode: None,
                status: ChatTransferStatus::WaitingAccept,
            },
        );
    }

    if let Some(transfer) = {
        let runtime = CHAT_RUNTIME.lock().await;
        runtime.incoming_waiting_decision.get(&offer.transfer_id).cloned()
    } {
        emit_incoming_offer_state(&transfer, None);
    }
    emit_lan_chat_event(serde_json::json!({
        "type": "file_offer",
        "offer": payload
    }));
}

pub(super) async fn handle_http_prepare_upload(body: String, remote_ip: Option<String>) -> FileHttpResponse {
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
    let to_device_id = json.get("to_device_id").and_then(|value| value.as_str()).unwrap_or("").trim().to_string();
    let proof = json.get("proof").and_then(|value| value.as_str()).unwrap_or("").trim().to_string();

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

    let files = json
        .get("files")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|item| {
            let file_id = item.get("file_id")?.as_str()?.trim().to_string();
            let file_name = item.get("file_name")?.as_str()?.trim().to_string();
            let file_size = item.get("file_size")?.as_u64()?;
            if file_id.is_empty() || file_name.is_empty() {
                return None;
            }
            Some(ChatFileMeta {
                file_id,
                file_name,
                file_size,
                file_hash: item
                    .get("file_hash")
                    .and_then(|value| value.as_str())
                    .map(|value| value.trim().to_string())
                    .filter(|value| !value.is_empty()),
            })
        })
        .collect::<Vec<_>>();

    if files.is_empty() {
        return FileHttpResponse {
            status_code: 400,
            body: r#"{"message":"未包含文件"}"#.to_string(),
        };
    }

    let sent_at_ms = json.get("sent_at_ms").and_then(|value| value.as_u64()).unwrap_or_else(current_time_ms);
    let expire_at_ms = json
        .get("expire_at_ms")
        .and_then(|value| value.as_u64())
        .unwrap_or_else(|| current_time_ms().saturating_add(CHAT_FILE_OFFER_EXPIRE_MS));
    let text = json
        .get("text")
        .and_then(|value| value.as_str())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let supported_modes = crate::services::lan_sync::state::parse_supported_transfer_modes(
        &json
            .get("supported_modes")
            .and_then(|value| value.as_array())
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| item.as_str().map(|value| value.to_string()))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default(),
    );
    let preferred_mode = crate::services::lan_sync::state::choose_preferred_transfer_mode(
        &supported_modes,
        json.get("preferred_mode").and_then(|value| value.as_str()),
    );

    let offer = ChatFileOfferPayload {
        transfer_id: transfer_id.clone(),
        from_device_id: from_device_id.clone(),
        to_device_id: to_device_id.clone(),
        text: text.clone(),
        files: files.clone(),
        sent_at_ms,
        expire_at_ms,
        supported_modes: supported_modes.iter().map(|mode| mode.as_str().to_string()).collect(),
        preferred_mode: Some(preferred_mode.as_str().to_string()),
        selected_mode: None,
    };

    let incoming_template = IncomingChatTransfer {
        transfer_id: transfer_id.clone(),
        from_device_id: from_device_id.clone(),
        to_device_id: to_device_id.clone(),
        text: text.clone(),
        files: files.clone(),
        sent_at_ms,
        expire_at_ms,
        supported_modes: supported_modes.clone(),
        preferred_mode,
        selected_mode: None,
        status: ChatTransferStatus::WaitingAccept,
    };

    let mut should_emit_offer = false;
    let mut decision_rx = None;
    let mut existing_selected_mode = None;
    {
        let mut runtime = CHAT_RUNTIME.lock().await;
        if let Some(existing) = runtime.incoming_waiting_decision.get_mut(&transfer_id) {
            if existing.from_device_id != from_device_id || existing.to_device_id != to_device_id {
                return FileHttpResponse {
                    status_code: 409,
                    body: r#"{"message":"传输会话不匹配"}"#.to_string(),
                };
            }
            existing_selected_mode = existing.selected_mode;
            if existing_selected_mode.is_none() {
                if runtime.incoming_decision_senders.contains_key(&transfer_id) {
                    return FileHttpResponse {
                        status_code: 409,
                        body: r#"{"message":"传输会话正在等待确认"}"#.to_string(),
                    };
                }
                let (decision_tx, rx) = tokio::sync::oneshot::channel();
                runtime.incoming_decision_senders.insert(transfer_id.clone(), decision_tx);
                decision_rx = Some(rx);
            }
        } else {
            let (decision_tx, rx) = tokio::sync::oneshot::channel();
            runtime
                .incoming_waiting_decision
                .insert(transfer_id.clone(), incoming_template.clone());
            runtime.incoming_decision_senders.insert(transfer_id.clone(), decision_tx);
            decision_rx = Some(rx);
            should_emit_offer = true;
        }
    }

    if let Some(ip) = remote_ip {
        MANAGER
            .remember_peer_file_server(&from_device_id, Some(ip), None, &[])
            .await;
    }

    if should_emit_offer {
        if let Some(transfer) = {
            let runtime = CHAT_RUNTIME.lock().await;
            runtime.incoming_waiting_decision.get(&transfer_id).cloned()
        } {
            emit_incoming_offer_state(&transfer, None);
        }
        emit_lan_chat_event(serde_json::json!({
            "type": "file_offer",
            "offer": offer
        }));
    }

    let decision = if let Some(selected_mode) = existing_selected_mode {
        IncomingDecision::Accept(selected_mode)
    } else {
        let Some(decision_rx) = decision_rx else {
            return FileHttpResponse {
                status_code: 409,
                body: r#"{"message":"传输会话状态异常"}"#.to_string(),
            };
        };
        let now = current_time_ms();
        let wait_ms = expire_at_ms.saturating_sub(now).max(1);
        match tokio::time::timeout(Duration::from_millis(wait_ms), decision_rx).await {
            Ok(Ok(value)) => value,
            _ => IncomingDecision::Reject,
        }
    };

    let incoming = if matches!(decision, IncomingDecision::Accept(ChatTransferMode::ReceiverPull)) {
        let mut runtime = CHAT_RUNTIME.lock().await;
        let incoming = {
            let Some(transfer) = runtime.incoming_waiting_decision.get_mut(&transfer_id) else {
                return FileHttpResponse {
                    status_code: 409,
                    body: r#"{"message":"传输会话不存在"}"#.to_string(),
                };
            };
            transfer.selected_mode = Some(ChatTransferMode::ReceiverPull);
            transfer.status = ChatTransferStatus::WaitingDownload;
            transfer.clone()
        };
        runtime.incoming_decision_senders.remove(&transfer_id);
        incoming
    } else {
        let mut runtime = CHAT_RUNTIME.lock().await;
        runtime.incoming_decision_senders.remove(&transfer_id);
        let Some(transfer) = runtime.incoming_waiting_decision.remove(&transfer_id) else {
            return FileHttpResponse {
                status_code: 409,
                body: r#"{"message":"传输会话不存在"}"#.to_string(),
            };
        };
        transfer
    };

    if !matches!(decision, IncomingDecision::Accept(_)) {
        let (event_type, next_status, error_message) = if current_time_ms() > incoming.expire_at_ms {
            ("file_expired", ChatTransferStatus::Expired, "文件传输请求已过期")
        } else if decision == IncomingDecision::CancelByReceiver {
            ("file_state", ChatTransferStatus::CanceledByReceiver, "已取消接收")
        } else {
            ("file_reject", ChatTransferStatus::Rejected, "文件传输请求已拒绝")
        };
        let mut incoming = incoming;
        incoming.status = next_status;
        emit_incoming_offer_state(&incoming, Some(error_message));
        if event_type != "file_state" {
            emit_lan_chat_event(build_file_decision_payload(
                event_type,
                &incoming.transfer_id,
                &incoming.from_device_id,
                &incoming.to_device_id,
                incoming.selected_mode,
            ));
        }
        return FileHttpResponse {
            status_code: if decision == IncomingDecision::CancelByReceiver { 409 } else { 403 },
            body: format!(
                r#"{{"message":"{}"}}"#,
                if event_type == "file_expired" {
                    "文件传输请求已过期"
                } else if decision == IncomingDecision::CancelByReceiver {
                    "接收方已取消"
                } else {
                    "文件传输请求已拒绝"
                }
            ),
        };
    }

    let selected_mode = match decision {
        IncomingDecision::Accept(mode) => mode,
        _ => ChatTransferMode::SenderPush,
    };

    if selected_mode == ChatTransferMode::ReceiverPull {
        let mut incoming = incoming;
        incoming.selected_mode = Some(selected_mode);
        incoming.status = ChatTransferStatus::WaitingDownload;
        emit_incoming_offer_state(&incoming, None);
        emit_lan_chat_event(build_file_decision_payload(
            "file_accept",
            &transfer_id,
            &incoming.from_device_id,
            &incoming.to_device_id,
            Some(selected_mode),
        ));
        return FileHttpResponse {
            status_code: 200,
            body: serde_json::json!({
                "transfer_id": transfer_id,
                "selected_mode": selected_mode.as_str(),
                "files": []
            })
            .to_string(),
        };
    }

    let receive_dir = match get_chat_receive_dir() {
        Ok(dir) => dir,
        Err(error) => {
            return FileHttpResponse {
                status_code: 500,
                body: format!(r#"{{"message":"{}"}}"#, error.replace('"', "'")),
            };
        }
    };

    let mut files_state = Vec::with_capacity(incoming.files.len());
    let mut reserved_names: HashSet<String> = HashSet::new();
    let mut total_size = 0u64;
    let mut accepted_files = Vec::with_capacity(incoming.files.len());
    for file in &incoming.files {
        let file_path = build_unique_file_path(&receive_dir, &file.file_name, &mut reserved_names);
        let upload_token = Uuid::new_v4().to_string();
        files_state.push(ReceiveFileProgress {
            file_id: file.file_id.clone(),
            file_name: file.file_name.clone(),
            file_size: file.file_size,
            file_hash: file.file_hash.clone(),
            upload_token: Some(upload_token.clone()),
            received: 0,
            received_ranges: Vec::new(),
            covered_size: 0,
            file_path,
            status: ChatTransferFileStatus::Queue,
            error_message: None,
        });
        accepted_files.push(serde_json::json!({
            "file_id": file.file_id,
            "upload_token": upload_token,
        }));
        total_size = total_size.saturating_add(file.file_size);
    }

    {
        let mut runtime = CHAT_RUNTIME.lock().await;
        runtime.incoming_receiving.insert(
            transfer_id.clone(),
            IncomingReceiveProgress {
                transfer_id: transfer_id.clone(),
                from_device_id: incoming.from_device_id.clone(),
                to_device_id: incoming.to_device_id.clone(),
                text: incoming.text.clone(),
                sent_at_ms: incoming.sent_at_ms,
                files: files_state,
                total_size,
                received_size: 0,
                status: ChatTransferStatus::Transferring,
            },
        );
    }

    if let Some(state) = {
        let runtime = CHAT_RUNTIME.lock().await;
        runtime.incoming_receiving.get(&transfer_id).cloned()
    } {
        emit_incoming_receive_state(&state, None);
    }

    emit_lan_chat_event(build_file_decision_payload(
        "file_accept",
        &transfer_id,
        &incoming.from_device_id,
        &incoming.to_device_id,
        Some(selected_mode),
    ));

    FileHttpResponse {
        status_code: 200,
        body: serde_json::json!({
            "transfer_id": transfer_id,
            "files": accepted_files
        })
        .to_string(),
    }
}

pub(super) async fn handle_http_upload(
    stream: &mut tokio::net::TcpStream,
    request: FileHttpRequest,
    _remote_ip: Option<String>,
) -> FileHttpResponse {
    use std::io::Write;
    use tokio::io::AsyncReadExt;

    let transfer_id = request.query.get("transfer_id").cloned().unwrap_or_default();
    let file_id = request.query.get("file_id").cloned().unwrap_or_default();
    let token = request.query.get("token").cloned().unwrap_or_default();
    if transfer_id.trim().is_empty() || file_id.trim().is_empty() || token.trim().is_empty() {
        return FileHttpResponse {
            status_code: 400,
            body: r#"{"message":"缺少上传参数"}"#.to_string(),
        };
    }

    let (file_path, expected_size, expected_hash, from_device_id, to_device_id, total_size, received_before) = {
        let runtime = CHAT_RUNTIME.lock().await;
        let Some(state) = runtime.incoming_receiving.get(&transfer_id) else {
            return FileHttpResponse {
                status_code: 409,
                body: r#"{"message":"传输会话不存在"}"#.to_string(),
            };
        };
        let Some(file_state) = state
            .files
            .iter()
            .find(|file| file.file_id == file_id && file.upload_token.as_deref() == Some(token.as_str()))
        else {
            return FileHttpResponse {
                status_code: 403,
                body: r#"{"message":"文件令牌无效"}"#.to_string(),
            };
        };
        (
            file_state.file_path.clone(),
            file_state.file_size,
            file_state.file_hash.clone(),
            state.from_device_id.clone(),
            state.to_device_id.clone(),
            state.total_size,
            state.received_size,
        )
    };

    {
        let mut runtime = CHAT_RUNTIME.lock().await;
        if let Some(state) = runtime.incoming_receiving.get_mut(&transfer_id) {
            state.status = ChatTransferStatus::Transferring;
            if let Some(file_state) = state.files.iter_mut().find(|file| file.file_id == file_id) {
                file_state.status = ChatTransferFileStatus::Transferring;
                file_state.error_message = None;
            }
            emit_incoming_receive_state(state, None);
        }
    }

    if let Some(parent) = file_path.parent() {
        if let Err(error) = std::fs::create_dir_all(parent) {
            return FileHttpResponse {
                status_code: 500,
                body: format!(r#"{{"message":"{}"}}"#, error.to_string().replace('"', "'")),
            };
        }
    }

    let mut file = match std::fs::OpenOptions::new().create(true).write(true).truncate(true).open(&file_path) {
        Ok(file) => file,
        Err(error) => {
            return FileHttpResponse {
                status_code: 500,
                body: format!(r#"{{"message":"{}"}}"#, error.to_string().replace('"', "'")),
            };
        }
    };

    let mut written = 0u64;
    let mut remaining = request.content_length;
    let mut body_prefix = request.body_prefix;
    if !body_prefix.is_empty() {
        let writable = std::cmp::min(body_prefix.len(), remaining);
        if let Err(error) = file.write_all(&body_prefix[..writable]) {
            return FileHttpResponse {
                status_code: 500,
                body: format!(r#"{{"message":"{}"}}"#, error.to_string().replace('"', "'")),
            };
        }
        written = written.saturating_add(writable as u64);
        remaining -= writable;
        body_prefix.clear();
        emit_lan_chat_event(serde_json::json!({
            "type": "file_progress",
            "transfer_id": transfer_id,
            "received_size": received_before.saturating_add(written),
            "total_size": total_size
        }));
    }

    let mut buffer = vec![0u8; FILE_HTTP_IO_BUFFER_SIZE];
    while remaining > 0 {
        let to_read = std::cmp::min(buffer.len(), remaining);
        let read = match stream.read(&mut buffer[..to_read]).await {
            Ok(size) => size,
            Err(error) => {
                return FileHttpResponse {
                    status_code: 500,
                    body: format!(r#"{{"message":"{}"}}"#, error.to_string().replace('"', "'")),
                };
            }
        };
        if read == 0 {
            break;
        }
        if let Err(error) = file.write_all(&buffer[..read]) {
            return FileHttpResponse {
                status_code: 500,
                body: format!(r#"{{"message":"{}"}}"#, error.to_string().replace('"', "'")),
            };
        }
        written = written.saturating_add(read as u64);
        remaining -= read;
        emit_lan_chat_event(serde_json::json!({
            "type": "file_progress",
            "transfer_id": transfer_id,
            "received_size": received_before.saturating_add(written),
            "total_size": total_size
        }));
    }

    if written != expected_size {
        return fail_incoming_transfer(
            transfer_id,
            file_id,
            from_device_id,
            to_device_id,
            "文件上传不完整".to_string(),
        )
        .await;
    }

    if let Some(expected_hash) = expected_hash.filter(|value| !value.trim().is_empty()) {
        match compute_blake3_file_hash_hex(&file_path) {
            Ok(actual_hash) if actual_hash.eq_ignore_ascii_case(&expected_hash) => {}
            Ok(_) => {
                return fail_incoming_transfer(
                    transfer_id,
                    file_id,
                    from_device_id,
                    to_device_id,
                    "文件校验失败".to_string(),
                )
                .await;
            }
            Err(error) => {
                return fail_incoming_transfer(transfer_id, file_id, from_device_id, to_device_id, error).await;
            }
        }
    }

    let completed_paths = {
        let mut runtime = CHAT_RUNTIME.lock().await;
        let Some(state) = runtime.incoming_receiving.get_mut(&transfer_id) else {
            return FileHttpResponse {
                status_code: 409,
                body: r#"{"message":"传输会话不存在"}"#.to_string(),
            };
        };
        let Some(file_state) = state.files.iter_mut().find(|file| file.file_id == file_id) else {
            return FileHttpResponse {
                status_code: 409,
                body: r#"{"message":"传输文件不存在"}"#.to_string(),
            };
        };

        let previous_received = file_state.received;
        file_state.received = written;
        file_state.covered_size = written;
        file_state.received_ranges = vec![(0, written)];
        file_state.status = ChatTransferFileStatus::Done;
        file_state.error_message = None;
        state.received_size = state.received_size.saturating_add(file_state.received.saturating_sub(previous_received));

        emit_incoming_receive_state(state, None);

        if state
            .files
            .iter()
            .all(|file| matches!(file.status, ChatTransferFileStatus::Done | ChatTransferFileStatus::Failed))
        {
            state.status = if state.files.iter().any(|file| file.status == ChatTransferFileStatus::Failed) {
                ChatTransferStatus::Partial
            } else {
                ChatTransferStatus::Done
            };
            emit_incoming_receive_state(state, None);
            let paths = state
                .files
                .iter()
                .map(|file| file.file_path.to_string_lossy().to_string())
                .collect::<Vec<_>>();
            runtime.incoming_receiving.remove(&transfer_id);
            Some(paths)
        } else {
            None
        }
    };

    if let Some(paths) = completed_paths {
        emit_lan_chat_event(build_file_done_payload(
            &transfer_id,
            &from_device_id,
            &to_device_id,
            Some(paths),
        ));
    }

    FileHttpResponse {
        status_code: 200,
        body: r#"{"ok":true}"#.to_string(),
    }
}

pub(super) async fn handle_http_cancel(request: FileHttpRequest, _remote_ip: Option<String>) -> FileHttpResponse {
    let transfer_id = request.query.get("transfer_id").cloned().unwrap_or_default();
    if transfer_id.trim().is_empty() {
        return FileHttpResponse {
            status_code: 400,
            body: r#"{"message":"缺少 transfer_id"}"#.to_string(),
        };
    }

    let (outgoing, incoming_offer, incoming_receive, decision_sender) = {
        let mut runtime = CHAT_RUNTIME.lock().await;
        (
            runtime
                .outgoing_waiting_accept
                .remove(&transfer_id)
                .or_else(|| runtime.outgoing_sending.remove(&transfer_id)),
            runtime.incoming_waiting_decision.remove(&transfer_id),
            runtime.incoming_receiving.remove(&transfer_id),
            runtime.incoming_decision_senders.remove(&transfer_id),
        )
    };

    if let Some(sender) = decision_sender {
        let _ = sender.send(IncomingDecision::Reject);
    }

    if let Some(mut transfer) = outgoing {
        transfer.status = ChatTransferStatus::CanceledByReceiver;
        for file in &transfer.files {
            let current = transfer
                .file_statuses
                .get(&file.file_id)
                .copied()
                .unwrap_or(ChatTransferFileStatus::Queue);
            if current != ChatTransferFileStatus::Done {
                transfer.file_statuses.insert(file.file_id.clone(), ChatTransferFileStatus::Canceled);
                transfer.file_errors.insert(file.file_id.clone(), Some("接收方已取消".to_string()));
            }
        }
        emit_outgoing_state(&transfer, Some("接收方已取消"));
    }
    if let Some(mut transfer) = incoming_offer {
        transfer.status = ChatTransferStatus::CanceledBySender;
        emit_incoming_offer_state(&transfer, Some("发送方已取消"));
    }
    if let Some(mut transfer) = incoming_receive {
        transfer.status = ChatTransferStatus::CanceledBySender;
        for file in &mut transfer.files {
            if file.status != ChatTransferFileStatus::Done {
                file.status = ChatTransferFileStatus::Canceled;
                file.error_message = Some("发送方已取消".to_string());
            }
        }
        emit_incoming_receive_state(&transfer, Some("发送方已取消"));
    }

    FileHttpResponse {
        status_code: 200,
        body: r#"{"ok":true}"#.to_string(),
    }
}

pub async fn handle_incoming_file_cancel_message(cancel: ChatFileCancelMessage) {
    let transfer_id = cancel.transfer_id.trim().to_string();
    if transfer_id.is_empty() {
        return;
    }

    let (outgoing, incoming_offer, incoming_receive, decision_sender) = {
        let mut runtime = CHAT_RUNTIME.lock().await;
        (
            runtime
                .outgoing_waiting_accept
                .remove(&transfer_id)
                .or_else(|| runtime.outgoing_sending.remove(&transfer_id)),
            runtime.incoming_waiting_decision.remove(&transfer_id),
            runtime.incoming_receiving.remove(&transfer_id),
            runtime.incoming_decision_senders.remove(&transfer_id),
        )
    };

    if let Some(sender) = decision_sender {
        let _ = sender.send(IncomingDecision::Reject);
    }

    if let Some(mut transfer) = outgoing {
        transfer.status = ChatTransferStatus::CanceledByReceiver;
        for file in &transfer.files {
            let current = transfer
                .file_statuses
                .get(&file.file_id)
                .copied()
                .unwrap_or(ChatTransferFileStatus::Queue);
            if current != ChatTransferFileStatus::Done {
                transfer.file_statuses.insert(file.file_id.clone(), ChatTransferFileStatus::Canceled);
                transfer.file_errors.insert(file.file_id.clone(), Some("接收方已取消".to_string()));
            }
        }
        emit_outgoing_state(&transfer, Some("接收方已取消"));
        return;
    }

    if let Some(mut transfer) = incoming_offer {
        transfer.status = ChatTransferStatus::CanceledBySender;
        emit_incoming_offer_state(&transfer, Some("发送方已取消"));
        return;
    }

    if let Some(mut transfer) = incoming_receive {
        transfer.status = ChatTransferStatus::CanceledBySender;
        for file in &mut transfer.files {
            if file.status != ChatTransferFileStatus::Done {
                file.status = ChatTransferFileStatus::Canceled;
                file.error_message = Some("发送方已取消".to_string());
            }
        }
        emit_incoming_receive_state(&transfer, Some("发送方已取消"));
    }
}

async fn fail_incoming_transfer(
    transfer_id: String,
    file_id: String,
    from_device_id: String,
    to_device_id: String,
    error: String,
) -> FileHttpResponse {
    let mut runtime = CHAT_RUNTIME.lock().await;
    if let Some(state) = runtime.incoming_receiving.get_mut(&transfer_id) {
        state.status = ChatTransferStatus::Failed;
        if let Some(file_state) = state.files.iter_mut().find(|file| file.file_id == file_id) {
            file_state.status = ChatTransferFileStatus::Failed;
            file_state.error_message = Some(error.clone());
        }
        emit_incoming_receive_state(state, Some(&error));
        runtime.incoming_receiving.remove(&transfer_id);
        emit_file_failed_event(&transfer_id, &from_device_id, &to_device_id, &error);
        return FileHttpResponse {
            status_code: 500,
            body: format!(r#"{{"message":"{}"}}"#, error.replace('"', "'")),
        };
    }

    FileHttpResponse {
        status_code: 200,
        body: r#"{"ok":true,"canceled":true}"#.to_string(),
    }
}
