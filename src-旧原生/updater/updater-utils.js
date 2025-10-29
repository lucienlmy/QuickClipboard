/**
 * 更新器工具函数
 */

import snarkdown from 'snarkdown';

/**
 * 比较版本号（支持 SemVer 预发布版本）
 */
export function compareVersions(v1, v2) {
  if (!v1 || !v2) return 0;
  
  const parseVersion = (version) => {
    const cleanVersion = String(version).trim().replace(/^v/i, '');
    const [mainVersion, prerelease] = cleanVersion.split('-');
    
    const mainParts = mainVersion.split('.').map(n => {
      const num = parseInt(n, 10);
      return Number.isNaN(num) ? 0 : num;
    });
    
    return {
      main: mainParts,
      prerelease: prerelease || null
    };
  };

  const parsed1 = parseVersion(v1);
  const parsed2 = parseVersion(v2);
  
  // 比较主版本号
  const maxLength = Math.max(parsed1.main.length, parsed2.main.length);
  for (let i = 0; i < maxLength; i++) {
    const a = parsed1.main[i] ?? 0;
    const b = parsed2.main[i] ?? 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  
  // 主版本号相同时，比较预发布版本
  if (parsed1.prerelease && parsed2.prerelease) {
    // 都是预发布版本，按字符串比较
    return parsed1.prerelease.localeCompare(parsed2.prerelease);
  } else if (parsed1.prerelease && !parsed2.prerelease) {
    // v1 是预发布，v2 是正式版 → v1 < v2
    return -1;
  } else if (!parsed1.prerelease && parsed2.prerelease) {
    // v1 是正式版，v2 是预发布 → v1 > v2
    return 1;
  }
  
  // 都是正式版本且相等
  return 0;
}

/**
 * 获取当前平台标识
 */
export function getCurrentPlatform() {
  const platform = window.navigator.platform.toLowerCase();
  const arch = navigator.userAgent.includes('ARM') || navigator.userAgent.includes('aarch64') ? 'aarch64' : 'x86_64';
  
  if (platform.includes('win')) {
    return 'windows-x86_64';
  } else if (platform.includes('mac')) {
    return arch === 'aarch64' ? 'darwin-aarch64' : 'darwin-x86_64';
  } else if (platform.includes('linux')) {
    return 'linux-x86_64';
  }
  
  return 'windows-x86_64';
}

/**
 * 格式化更新说明（Markdown 转 HTML）
 */
export function formatReleaseNotes(body) {
  if (!body) return '暂无更新说明';

  const cleanBody = body.replace(/^---\s*$/gm, '');

  let html = snarkdown(cleanBody);

  html = html
    .replace(/<h1>/g, '<h1 style="margin: 18px 0 12px 0; font-size: 15px; color: var(--text-primary, #333); font-weight: 700; padding-bottom: 8px; border-bottom: 2px solid var(--border-primary, #e0e0e0);">')
    .replace(/<h2>/g, '<h2 style="margin: 16px 0 10px 0; font-size: 14px; color: var(--text-primary, #333); font-weight: 700;">')
    .replace(/<h3>/g, '<h3 style="margin: 14px 0 8px 0; font-size: 13px; color: var(--text-primary, #333); font-weight: 600; padding-left: 12px; border-left: 3px solid var(--primary-color, #4a89dc);">')
    .replace(/<ul>/g, '<ul style="margin: 12px 0; padding-left: 0; list-style: none;">')
    .replace(/<li>/g, '<li style="display: flex; align-items: flex-start; margin: 6px 0;"><span style="color: var(--primary-color, #4a89dc); margin-right: 8px; font-weight: bold; flex-shrink: 0;">•</span><span style="flex: 1; color: var(--text-secondary, #666); line-height: 1.6;">')
    .replace(/<\/li>/g, '</span></li>')
    .replace(/<p>/g, '<p style="margin: 8px 0; color: var(--text-secondary, #666); line-height: 1.6;">')
    .replace(/<code>/g, '<code style="background: var(--bg-secondary, #f8f9fa); color: var(--primary-color, #4a89dc); padding: 2px 6px; border-radius: 3px; font-family: monospace; font-size: 12px; border: 1px solid var(--border-primary, #e0e0e0);">')
    .replace(/<strong>/g, '<strong style="color: var(--text-primary, #333); font-weight: 600;">');
  
  return html;
}

