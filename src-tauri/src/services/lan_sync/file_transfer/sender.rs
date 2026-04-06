use crate::services::lan_sync::state::{
    build_file_decision_payload, build_file_done_payload, compute_blake3_file_hash_hex, compute_transfer_proof,
    current_time_ms, device_id, emit_file_failed_event, emit_lan_chat_event, emit_outgoing_state, get_pair_secret,
    ChatFileInfoInput, ChatFileOfferInput, ChatFileOfferPayload, ChatTransferFileStatus, ChatTransferStatus,
    OutgoingChatTransfer, CHAT_FILE_OFFER_EXPIRE_MS, CHAT_RUNTIME, FILE_HTTP_PREPARE_PATH, FILE_HTTP_UPLOAD_PATH,
    MANAGER,
};
use lan_sync_core::{ChatFileMeta, LanSyncError};
use std::collections::HashMap;
use std::path::Path;
use uuid::Uuid;

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
                status: ChatTransferStatus::WaitingAccept,
                file_statuses,
                file_errors,
            },
        );
    }

    if let Some(transfer) = {
        let runtime = CHAT_RUNTIME.lock().await;
        runtime.outgoing_waiting_accept.get(&transfer_id).cloned()
    } {
        emit_outgoing_state(&transfer, None);
    }

    let offer_to_send = offer.clone();
    tauri::async_runtime::spawn(async move {
        let _ = negotiate_and_upload_chat_files(offer_to_send.transfer_id.clone()).await;
    });
    Ok(offer)
}

async fn negotiate_and_upload_chat_files(transfer_id: String) -> Result<(), String> {
    let outgoing = {
        let runtime = CHAT_RUNTIME.lock().await;
        runtime.outgoing_waiting_accept.get(&transfer_id).cloned()
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
            ));
        }
        return Err("文件传输请求已过期".to_string());
    }

    let url = MANAGER
        .resolve_peer_file_server_url(&outgoing.to_device_id, FILE_HTTP_PREPARE_PATH, &[])
        .await
        .ok_or_else(|| "未找到对端文件服务".to_string())?;
    let pair_secret = get_pair_secret(&outgoing.to_device_id)
        .ok_or_else(|| "未保存对端配对信息".to_string())?;
    let proof = compute_transfer_proof(&pair_secret, &outgoing.from_device_id, &outgoing.transfer_id)?;

    let mut payload = serde_json::Map::new();
    payload.insert("transfer_id".to_string(), serde_json::json!(outgoing.transfer_id));
    payload.insert("from_device_id".to_string(), serde_json::json!(outgoing.from_device_id));
    payload.insert("to_device_id".to_string(), serde_json::json!(outgoing.to_device_id));
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

    let client = reqwest::Client::new();
    let response = client.post(url).json(&payload).send().await.map_err(|e| e.to_string())?;

    if response.status() == reqwest::StatusCode::FORBIDDEN {
        let mut runtime = CHAT_RUNTIME.lock().await;
        if let Some(mut transfer) = runtime.outgoing_waiting_accept.remove(&transfer_id) {
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
            ));
        }
        return Err("接收方已拒绝".to_string());
    }

    if response.status() == reqwest::StatusCode::CONFLICT {
        let mut runtime = CHAT_RUNTIME.lock().await;
        if let Some(mut transfer) = runtime.outgoing_waiting_accept.remove(&transfer_id) {
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

    if !response.status().is_success() {
        let message = response.text().await.unwrap_or_else(|_| "文件协商失败".to_string());
        let mut runtime = CHAT_RUNTIME.lock().await;
        if let Some(mut transfer) = runtime.outgoing_waiting_accept.remove(&transfer_id) {
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

    let body = response.text().await.map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
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
        if let Some(mut transfer) = runtime.outgoing_waiting_accept.remove(&transfer_id) {
            if transfer.status.is_canceled() {
                return Ok(());
            }
            transfer.status = ChatTransferStatus::Transferring;
            emit_outgoing_state(&transfer, None);
            runtime.outgoing_sending.insert(transfer_id.clone(), transfer);
        } else {
            return Ok(());
        }
    }
    emit_lan_chat_event(build_file_decision_payload(
        "file_accept",
        &transfer_id,
        &outgoing.to_device_id,
        &outgoing.from_device_id,
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
        let upload_url = MANAGER
            .resolve_peer_file_server_url(
                &outgoing.to_device_id,
                FILE_HTTP_UPLOAD_PATH,
                &[
                    ("transfer_id".to_string(), outgoing.transfer_id.clone()),
                    ("file_id".to_string(), file_id),
                    ("token".to_string(), token),
                ],
            )
            .await
            .ok_or_else(|| "未找到对端文件上传地址".to_string())?;

        let file_path = file.file_path.clone();
        let transfer_id_for_emit = outgoing.transfer_id.clone();
        let from_device_id_for_emit = outgoing.from_device_id.clone();
        let to_device_id_for_emit = outgoing.to_device_id.clone();
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

            let raw_file = std::fs::File::open(&file_path).map_err(|e| e.to_string())?;
            let reader = ProgressReader {
                inner: raw_file,
                transfer_id: transfer_id_for_emit,
                sent_base: sent_size_before,
                sent_total: 0,
                total_size,
            };

            let response = reqwest::blocking::Client::new()
                .post(upload_url)
                .header(reqwest::header::CONTENT_LENGTH, file_size)
                .body(reqwest::blocking::Body::new(reader))
                .send()
                .map_err(|e| e.to_string())?;

            if !response.status().is_success() {
                return Err(response.text().unwrap_or_else(|_| format!("文件上传失败: {file_name}")));
            }

            Ok(file_size)
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
