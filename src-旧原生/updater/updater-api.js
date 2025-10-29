/**
 * 更新器 API 模块
 */

import { invoke } from '@tauri-apps/api/core';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

export const REPO_URL = 'https://github.com/mosheng1/QuickClipboard';
/**
 * 从 latest.json 获取最新版本信息
 */
export async function fetchLatestRelease(includeBeta = false) {
  const jsonUrl = `${REPO_URL}/releases/latest/download/latest.json`;
  const jsonRes = await tauriFetch(jsonUrl, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'QuickClipboard',
      'join-beta': String(includeBeta)  
    }
  });
  
  if (!jsonRes.ok) {
    throw new Error(`获取版本信息失败: ${jsonRes.status} ${jsonRes.statusText}`);
  }
  
  const data = await jsonRes.json();

  let releaseBody = '';
  if (data.notes && data.notes.startsWith('http')) {
    try {
      const notesRes = await tauriFetch(data.notes, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'QuickClipboard'
        }
      });
      if (notesRes.ok) {
        const releaseData = await notesRes.json();
        releaseBody = (releaseData.body || '').replace(/\r\n/g, '\n').replace(/\r/g, '');
      }
    } catch (error) {
      releaseBody = '无法获取更新日志';
    }
  } else {
    releaseBody = data.notes || '';
  }
  
  return {
    version: data.version,
    name: data.name || `v${data.version}`,
    body: releaseBody,
    date: data.pub_date || new Date().toISOString(),
    platforms: data.platforms || {},
    forceUpdate: data.forceUpdate === true,
    isPrerelease: false,
    htmlUrl: `${REPO_URL}/releases/tag/v${data.version}`,
    repoUrl: REPO_URL
  };
}

/**
 * 获取当前应用版本
 */
export async function getCurrentVersion() {
  try {
    const info = await invoke('get_app_version');
    return (info?.version || '').replace(/^v/i, '');
  } catch {
    return '';
  }
}

/**
 * 检查是否为便携版模式
 */
export async function checkPortableMode() {
  try {
    return await invoke('is_portable_mode');
  } catch {
    return false;
  }
}

