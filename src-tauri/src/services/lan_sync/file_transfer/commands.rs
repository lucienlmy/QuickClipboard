use crate::services::lan_sync::state::{
    build_cancel_result, choose_preferred_transfer_mode, current_time_ms, device_id, emit_incoming_offer_state,
    emit_incoming_receive_state, emit_outgoing_state, notify_peer_canceled, ChatFileAcceptInput,
    ChatFileCancelInput, ChatFileCancelResult, ChatFileDecisionPayload, ChatFileInfoInput, ChatFileRejectInput,
    ChatTransferFileStatus, ChatTransferMode, ChatTransferStatus, IncomingDecision, CHAT_RUNTIME, MANAGER,
};
use lan_sync_core::{ChatFileCancelMessage, ChatFileDecisionMessage, LanSyncError, LanSyncMessage};
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub async fn chat_prepare_files(paths: Vec<String>) -> Result<Vec<ChatFileInfoInput>, LanSyncError> {
    if paths.is_empty() {
        return Ok(Vec::new());
    }

    fn normalize_rel_path(path: &Path) -> String {
        path.to_string_lossy().replace('\\', "/")
    }

    fn collect_files_in_directory(dir_path: &Path) -> Result<Vec<(PathBuf, String)>, LanSyncError> {
        let root_name = dir_path
            .file_name()
            .and_then(|s| s.to_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| "文件夹".to_string());

        let mut out: Vec<(PathBuf, String)> = Vec::new();
        let mut stack: Vec<PathBuf> = vec![dir_path.to_path_buf()];

        while let Some(current_dir) = stack.pop() {
            let entries = std::fs::read_dir(&current_dir).map_err(|e| LanSyncError::Protocol(e.to_string()))?;

            for entry in entries {
                let entry = entry.map_err(|e| LanSyncError::Protocol(e.to_string()))?;
                let path = entry.path();
                let meta = std::fs::symlink_metadata(&path).map_err(|e| LanSyncError::Protocol(e.to_string()))?;

                // 跳过符号链接，避免循环引用或跨目录意外遍历
                if meta.file_type().is_symlink() {
                    continue;
                }
                if meta.is_dir() {
                    stack.push(path);
                    continue;
                }
                if !meta.is_file() {
                    continue;
                }

                let relative = path
                    .strip_prefix(dir_path)
                    .map(normalize_rel_path)
                    .unwrap_or_else(|_| {
                        path.file_name()
                            .and_then(|s| s.to_str())
                            .map(|s| s.to_string())
                            .unwrap_or_else(|| "未命名文件".to_string())
                    });

                let display_name = if relative.is_empty() {
                    root_name.clone()
                } else {
                    format!("{}/{}", root_name, relative)
                };
                out.push((path, display_name));
            }
        }

        Ok(out)
    }

    let mut out = Vec::new();
    for path in paths {
        let p = Path::new(&path);
        if !p.exists() {
            continue;
        }

        if p.is_file() {
            let meta = std::fs::metadata(p).map_err(|e| LanSyncError::Protocol(e.to_string()))?;
            let file_name = p
                .file_name()
                .and_then(|s| s.to_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| "未命名文件".to_string());

            out.push(ChatFileInfoInput {
                file_id: Uuid::new_v4().to_string(),
                file_name,
                file_size: meta.len(),
                file_path: path,
                file_hash: None,
            });
            continue;
        }

        if p.is_dir() {
            let files = collect_files_in_directory(p)?;
            for (file_path, display_name) in files {
                let meta = std::fs::metadata(&file_path).map_err(|e| LanSyncError::Protocol(e.to_string()))?;
                out.push(ChatFileInfoInput {
                    file_id: Uuid::new_v4().to_string(),
                    file_name: display_name,
                    file_size: meta.len(),
                    file_path: file_path.to_string_lossy().to_string(),
                    file_hash: None,
                });
            }
        }
    }

    Ok(out)
}

pub async fn chat_reject_file_offer(input: ChatFileRejectInput) -> Result<ChatFileDecisionPayload, LanSyncError> {
    let from_device_id = input.from_device_id.clone();
    let decision = ChatFileDecisionPayload {
        transfer_id: input.transfer_id.clone(),
        from_device_id: device_id(),
        to_device_id: from_device_id.clone(),
        decided_at_ms: current_time_ms(),
        selected_mode: None,
    };

    let (transfer, sender) = {
        let mut runtime = CHAT_RUNTIME.lock().await;
        (
            runtime.incoming_waiting_decision.remove(&input.transfer_id),
            runtime.incoming_decision_senders.remove(&input.transfer_id),
        )
    };
    if let Some(mut transfer) = transfer {
        transfer.status = ChatTransferStatus::Rejected;
        emit_incoming_offer_state(&transfer, Some("文件传输请求已拒绝"));
    }
    if let Some(sender) = sender {
        let _ = sender.send(IncomingDecision::Reject);
    }
    MANAGER
        .send_message_to_device(
            &from_device_id,
            LanSyncMessage::ChatFileReject {
                decision: ChatFileDecisionMessage {
                    transfer_id: input.transfer_id,
                    from_device_id: device_id(),
                    to_device_id: from_device_id.clone(),
                    decided_at_ms: current_time_ms(),
                    selected_mode: None,
                },
            },
        )
        .await?;
    Ok(decision)
}

pub async fn chat_accept_file_offer(input: ChatFileAcceptInput) -> Result<ChatFileDecisionPayload, LanSyncError> {
    let expired = {
        let runtime = CHAT_RUNTIME.lock().await;
        runtime
            .incoming_waiting_decision
            .get(&input.transfer_id)
            .map(|item| current_time_ms() > item.expire_at_ms)
            .unwrap_or(true)
    };

    if expired {
        return Err(LanSyncError::Protocol("文件邀约已过期".to_string()));
    }

    let (sender, selected_mode) = {
        let mut runtime = CHAT_RUNTIME.lock().await;
        let mut selected_mode = ChatTransferMode::SenderPush;
        if let Some(transfer) = runtime.incoming_waiting_decision.get_mut(&input.transfer_id) {
            selected_mode = input
                .selected_mode
                .as_deref()
                .and_then(ChatTransferMode::from_str)
                .filter(|mode| transfer.supported_modes.contains(mode))
                .unwrap_or_else(|| choose_preferred_transfer_mode(&transfer.supported_modes, Some(transfer.preferred_mode.as_str())));
            transfer.selected_mode = Some(selected_mode);
            transfer.status = if selected_mode == ChatTransferMode::ReceiverPull {
                ChatTransferStatus::WaitingDownload
            } else {
                ChatTransferStatus::Transferring
            };
            emit_incoming_offer_state(transfer, None);
        }
        (
            runtime.incoming_decision_senders.remove(&input.transfer_id),
            selected_mode,
        )
    };

    if let Some(sender) = sender {
        let _ = sender.send(IncomingDecision::Accept(selected_mode));
    }

    MANAGER
        .send_message_to_device(
            &input.from_device_id,
            LanSyncMessage::ChatFileAccept {
                decision: ChatFileDecisionMessage {
                    transfer_id: input.transfer_id.clone(),
                    from_device_id: device_id(),
                    to_device_id: input.from_device_id.clone(),
                    decided_at_ms: current_time_ms(),
                    selected_mode: Some(selected_mode.as_str().to_string()),
                },
            },
        )
        .await?;

    Ok(ChatFileDecisionPayload {
        transfer_id: input.transfer_id,
        from_device_id: device_id(),
        to_device_id: input.from_device_id,
        decided_at_ms: current_time_ms(),
        selected_mode: Some(selected_mode.as_str().to_string()),
    })
}

pub async fn chat_cancel_transfer(input: ChatFileCancelInput) -> Result<ChatFileCancelResult, LanSyncError> {
    let transfer_id = input.transfer_id.trim().to_string();
    if transfer_id.is_empty() {
        return Err(LanSyncError::Protocol("transfer_id 不能为空".to_string()));
    }

    let outgoing = {
        let mut runtime = CHAT_RUNTIME.lock().await;
        runtime
            .outgoing_waiting_accept
            .remove(&transfer_id)
            .or_else(|| runtime.outgoing_sending.remove(&transfer_id))
    };
    if let Some(mut transfer) = outgoing {
        transfer.status = ChatTransferStatus::CanceledBySender;
        for file in &transfer.files {
            let current = transfer
                .file_statuses
                .get(&file.file_id)
                .copied()
                .unwrap_or(ChatTransferFileStatus::Queue);
            if current != ChatTransferFileStatus::Done {
                transfer.file_statuses.insert(file.file_id.clone(), ChatTransferFileStatus::Canceled);
                transfer.file_errors.insert(file.file_id.clone(), Some("已取消发送".to_string()));
            }
        }
        emit_outgoing_state(&transfer, Some("已取消发送"));
        MANAGER
            .send_message_to_device(
                &transfer.to_device_id,
                LanSyncMessage::ChatFileCancel {
                    cancel: ChatFileCancelMessage {
                        transfer_id: transfer_id.clone(),
                        from_device_id: device_id(),
                        to_device_id: transfer.to_device_id.clone(),
                    },
                },
            )
            .await?;
        let peer_device_id = transfer.to_device_id.clone();
        let transfer_id_for_http = transfer_id.clone();
        tauri::async_runtime::spawn(async move {
            notify_peer_canceled(&peer_device_id, &transfer_id_for_http).await;
        });
        return Ok(build_cancel_result(
            transfer_id,
            transfer.to_device_id,
            ChatTransferStatus::CanceledBySender,
        ));
    }

    let (incoming_offer, decision_sender) = {
        let mut runtime = CHAT_RUNTIME.lock().await;
        (
            runtime.incoming_waiting_decision.remove(&transfer_id),
            runtime.incoming_decision_senders.remove(&transfer_id),
        )
    };
    if let Some(mut transfer) = incoming_offer {
        transfer.status = ChatTransferStatus::CanceledByReceiver;
        emit_incoming_offer_state(&transfer, Some("已取消接收"));
        if let Some(sender) = decision_sender {
            let _ = sender.send(IncomingDecision::CancelByReceiver);
        }
        MANAGER
            .send_message_to_device(
                &transfer.from_device_id,
                LanSyncMessage::ChatFileCancel {
                    cancel: ChatFileCancelMessage {
                        transfer_id: transfer_id.clone(),
                        from_device_id: device_id(),
                        to_device_id: transfer.from_device_id.clone(),
                    },
                },
            )
            .await?;
        let peer_device_id = transfer.from_device_id.clone();
        let transfer_id_for_http = transfer_id.clone();
        tauri::async_runtime::spawn(async move {
            notify_peer_canceled(&peer_device_id, &transfer_id_for_http).await;
        });
        return Ok(build_cancel_result(
            transfer_id,
            transfer.from_device_id,
            ChatTransferStatus::CanceledByReceiver,
        ));
    }

    let incoming_receive = {
        let mut runtime = CHAT_RUNTIME.lock().await;
        runtime.incoming_receiving.remove(&transfer_id)
    };
    if let Some(mut transfer) = incoming_receive {
        transfer.status = ChatTransferStatus::CanceledByReceiver;
        for file in &mut transfer.files {
            if file.status != ChatTransferFileStatus::Done {
                file.status = ChatTransferFileStatus::Canceled;
                file.error_message = Some("已取消接收".to_string());
            }
        }
        emit_incoming_receive_state(&transfer, Some("已取消接收"));
        MANAGER
            .send_message_to_device(
                &transfer.from_device_id,
                LanSyncMessage::ChatFileCancel {
                    cancel: ChatFileCancelMessage {
                        transfer_id: transfer_id.clone(),
                        from_device_id: device_id(),
                        to_device_id: transfer.from_device_id.clone(),
                    },
                },
            )
            .await?;
        let peer_device_id = transfer.from_device_id.clone();
        let transfer_id_for_http = transfer_id.clone();
        tauri::async_runtime::spawn(async move {
            notify_peer_canceled(&peer_device_id, &transfer_id_for_http).await;
        });
        return Ok(build_cancel_result(
            transfer_id,
            transfer.from_device_id,
            ChatTransferStatus::CanceledByReceiver,
        ));
    }

    if let Some(peer_device_id) = input.peer_device_id.filter(|value| !value.trim().is_empty()) {
        return Ok(build_cancel_result(
            transfer_id,
            peer_device_id,
            ChatTransferStatus::CanceledBySender,
        ));
    }

    Err(LanSyncError::Protocol("传输不存在或已结束".to_string()))
}

pub async fn chat_reveal_file(path: &str) -> Result<(), LanSyncError> {
    let p = Path::new(path);
    if !p.exists() {
        return Err(LanSyncError::Protocol("文件不存在".to_string()));
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg("/select,")
            .arg(p)
            .spawn()
            .map_err(|e| LanSyncError::Protocol(format!("打开文件位置失败: {}", e)))?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    {
        let parent = p.parent().ok_or_else(|| LanSyncError::Protocol("无效路径".to_string()))?;
        std::process::Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(|e| LanSyncError::Protocol(format!("打开目录失败: {}", e)))?;
        Ok(())
    }
}
