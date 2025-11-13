import { invoke } from '@tauri-apps/api/core'

export async function getCurrentStoragePath() {
  return await invoke('dm_get_current_storage_path')
}

export async function changeStoragePath(newPath) {
  return await invoke('dm_change_storage_path', { payload: { new_path: newPath } })
}

export async function resetStoragePathToDefault() {
  return await invoke('dm_reset_storage_path_to_default')
}

export async function exportDataZip(targetPath) {
  return await invoke('dm_export_data_zip', { payload: { target_path: targetPath } })
}
