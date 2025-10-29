// 禁用浏览器默认快捷键模块

let isRecordingShortcut = false;

window.setShortcutRecording = function (recording) {
  isRecordingShortcut = recording;
  console.log('快捷键录制状态:', recording ? '开始' : '结束');
};

function isCurrentlyRecording() {
  if (isRecordingShortcut) return true;

  const activeElement = document.activeElement;
  if (activeElement && activeElement.classList.contains('shortcut-input')) return true;
  return document.querySelector('.shortcut-input.recording') !== null;
}

// 禁用的浏览器快捷键列表
const DISABLED_SHORTCUTS = [
  // 系统级
  { key: 'F1' }, { key: 'F3' }, { key: 'F5' }, { key: 'F11' }, { key: 'F12' },
  { ctrl: true, key: 'F5' }, { ctrl: true, shift: true, key: 'r' },
  { ctrl: true, key: 'r' }, { key: 'Escape' },

  // 页面控制
  { ctrl: true, key: 'p' }, { ctrl: true, key: 's' }, { ctrl: true, key: 'o' },
  { ctrl: true, key: 'n' }, { ctrl: true, key: 't' }, { ctrl: true, key: 'w' },
  { ctrl: true, key: 'u' }, { ctrl: true, shift: true, key: 'i' },
  { ctrl: true, shift: true, key: 'j' }, { ctrl: true, shift: true, key: 'c' },
  { ctrl: true, shift: true, key: 't' },

  // 标签页切换
  { ctrl: true, key: 'Tab' }, { ctrl: true, shift: true, key: 'Tab' },
  { ctrl: true, key: 'PageUp' }, { ctrl: true, key: 'PageDown' },
  ...Array.from({ length: 9 }, (_, i) => ({ ctrl: true, key: (i + 1).toString() })),

  // Alt 组合键
  { alt: true, key: 'ArrowLeft' }, { alt: true, key: 'ArrowRight' },
  { alt: true, key: 'Home' }, { alt: true, key: 'd' }, { alt: true, key: 'f' },

  // 缩放
  { ctrl: true, key: '+' }, { ctrl: true, key: '=' }, { ctrl: true, key: '-' }, { ctrl: true, key: '0' },
];

function matchesShortcut(event, shortcut) {
  return (
    (!!shortcut.ctrl === event.ctrlKey) &&
    (!!shortcut.alt === event.altKey) &&
    (!!shortcut.shift === event.shiftKey) &&
    (
      shortcut.key.toLowerCase() === event.key.toLowerCase() ||
      shortcut.key.toLowerCase() === event.code.replace('Key', '').toLowerCase()
    )
  );
}

// 全局事件处理器
function handleKeyDown(event) {
  if (isCurrentlyRecording()) return;

  const tag = event.target.tagName;
  const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || event.target.isContentEditable;

  // 放行输入框常用编辑操作
  if (isInput) {
    const allowed = ['ctrl+a', 'ctrl+c', 'ctrl+v', 'ctrl+x', 'ctrl+z', 'ctrl+y'];
    const combo = `${event.ctrlKey ? 'ctrl+' : ''}${event.altKey ? 'alt+' : ''}${event.shiftKey ? 'shift+' : ''}${event.key.toLowerCase()}`;
    if (allowed.includes(combo)) return;
  }

  for (const shortcut of DISABLED_SHORTCUTS) {
    if (matchesShortcut(event, shortcut)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return false;
    }
  }
}

// 初始化函数
export function initDisableBrowserShortcuts() {
  document.addEventListener('keydown', handleKeyDown, true);
  document.addEventListener('contextmenu', e => e.preventDefault(), true);
  document.addEventListener('dragstart', e => e.preventDefault(), true);
  document.addEventListener('copy', e => e.stopPropagation(), true);
}

export function removeDisableBrowserShortcuts() {
  document.removeEventListener('keydown', handleKeyDown, true);
}
