import { invoke } from '@tauri-apps/api/core';

export async function createTransferShelf() {
  return await invoke('transfer_shelf_create');
}

export async function listTransferShelves() {
  return await invoke('transfer_shelf_list');
}

export async function focusTransferShelf(id) {
  return await invoke('transfer_shelf_focus', { id });
}

export async function renameTransferShelf(id, name) {
  return await invoke('transfer_shelf_rename', { id, name });
}

export async function closeTransferShelf(id) {
  return await invoke('transfer_shelf_close', { id });
}

export async function describeTransferShelfPaths(paths) {
  return await invoke('transfer_shelf_describe_paths', { paths });
}

export async function loadTransferShelfState(id) {
  return await invoke('transfer_shelf_load_state', { id });
}

export async function saveTransferShelfState(id, files, selectedPeerIds) {
  return await invoke('transfer_shelf_save_state', {
    id,
    files,
    selectedPeerIds,
  });
}

export async function saveTransferShelfGeometry(id) {
  return await invoke('transfer_shelf_save_geometry', { id });
}

export async function applyTransferShelfGeometry(id) {
  return await invoke('transfer_shelf_apply_geometry', { id });
}
