import { invoke } from '@tauri-apps/api/core';

export async function testWebdavConnection() {
  return await invoke('webdav_test_connection');
}

export async function uploadWebdav() {
  return await invoke('webdav_upload');
}

export async function downloadWebdav() {
  return await invoke('webdav_download');
}

export async function downloadAllWebdav() {
  return await invoke('webdav_download_all');
}

export async function getWebdavStatus() {
  return await invoke('webdav_get_status');
}

export async function getWebdavLastReport() {
  return await invoke('webdav_get_last_report');
}

export async function startWebdavScheduler() {
  return await invoke('webdav_start_scheduler');
}

export async function stopWebdavScheduler() {
  return await invoke('webdav_stop_scheduler');
}
