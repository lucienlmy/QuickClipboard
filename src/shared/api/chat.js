import { invoke } from '@tauri-apps/api/core';

export async function listLanChatConnectedDevices() {
  return await invoke('lan_chat_list_connected_devices');
}

export async function sendLanChatText(toDeviceId, text) {
  return await invoke('lan_chat_send_text', {
    input: {
      to_device_id: toDeviceId,
      text
    }
  });
}

export async function sendLanChatFileOffer(toDeviceId, text, files) {
  return await invoke('lan_chat_send_file_offer', {
    input: {
      to_device_id: toDeviceId,
      text: text || null,
      files
    }
  });
}

export async function acceptLanChatFileOffer(transferId, fromDeviceId) {
  return await invoke('lan_chat_accept_file_offer', {
    input: {
      transfer_id: transferId,
      from_device_id: fromDeviceId
    }
  });
}

export async function rejectLanChatFileOffer(transferId, fromDeviceId) {
  return await invoke('lan_chat_reject_file_offer', {
    input: {
      transfer_id: transferId,
      from_device_id: fromDeviceId
    }
  });
}

export async function prepareLanChatFiles(paths) {
  return await invoke('lan_chat_prepare_files', { paths });
}

export async function revealLanChatFile(path) {
  return await invoke('lan_chat_reveal_file', { path });
}

export async function copyLanChatReceivedFiles(paths) {
  return await invoke('copy_files_to_clipboard', { paths });
}

export async function ensureLanChatDropProxy() {
  return await invoke('lan_chat_drop_proxy_ensure');
}

export async function showLanChatDropProxy(bounds) {
  return await invoke('lan_chat_drop_proxy_show', { bounds });
}

export async function hideLanChatDropProxy() {
  return await invoke('lan_chat_drop_proxy_hide');
}

export async function disposeLanChatDropProxy() {
  return await invoke('lan_chat_drop_proxy_dispose');
}
