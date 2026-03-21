import { invoke } from '@tauri-apps/api/core';

export async function showPreviewWindow(mode, source, itemId) {
  return await invoke('show_preview_window', {
    mode,
    source,
    itemId: String(itemId),
  });
}

export async function closePreviewWindow() {
  return await invoke('close_preview_window');
}

