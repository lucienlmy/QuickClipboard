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

export async function closeTransferShelf(id) {
  return await invoke('transfer_shelf_close', { id });
}

export async function describeTransferShelfPaths(paths) {
  return await invoke('transfer_shelf_describe_paths', { paths });
}
