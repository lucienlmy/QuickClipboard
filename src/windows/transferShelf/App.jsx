import { useEffect, useMemo, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
import { showConfirm } from '@shared/utils/dialog';
import {
  applyTransferShelfGeometry,
  closeTransferShelf,
  describeTransferShelfPaths,
  listSyncTransferLanPairedPeers,
  loadTransferShelfState,
  renameTransferShelf,
  saveTransferShelfGeometry,
  saveTransferShelfState,
  sendTransferShelf,
} from '@shared/api';
import { useDragWithThreshold } from '@shared/hooks/useDragWithThreshold';

const FILES_DROPPED_EVENT = 'transfer-shelf-files-dropped';
const DROP_ACTIVE_EVENT = 'transfer-shelf-drop-active';
const TASK_PROGRESS_EVENT = 'transfer-shelf-task-progress';
const PERSIST_DEBOUNCE_MS = 400;
const GEOMETRY_DEBOUNCE_MS = 400;
const VIEW_MODE_KEY = 'transferShelfViewMode';
const PEERS_COLLAPSED_KEY = 'transferShelfPeersCollapsed';
const PEERS_MAX_INNER = 90;
const PEERS_PADDING_TOP = 8;
const PEERS_BLOCK_FALLBACK = PEERS_MAX_INNER + PEERS_PADDING_TOP;
const TOGGLE_ANIM_MS = 160;

function getShelfIdFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('shelfId') ?? '';
  } catch {
    return '';
  }
}

function formatSize(size) {
  if (!Number.isFinite(size) || size <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = size;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function createFileItem(info) {
  return {
    id: info.path,
    path: info.path,
    name: info.name || info.path,
    size: Number(info.size) || 0,
    isDir: Boolean(info.isDir),
    exists: Boolean(info.exists),
    icon: info.icon || '',
    addedAt: Date.now(),
  };
}

function toPersistedFile(file) {
  return {
    path: file.path,
    name: file.name,
    size: Number(file.size) || 0,
    isDir: Boolean(file.isDir),
    exists: Boolean(file.exists),
    icon: file.icon || '',
  };
}

function readStoredViewMode() {
  try {
    const value = localStorage.getItem(VIEW_MODE_KEY);
    return value === 'grid' ? 'grid' : 'list';
  } catch {
    return 'list';
  }
}

function readStoredPeersCollapsed() {
  try {
    const value = localStorage.getItem(PEERS_COLLAPSED_KEY);
    return value !== '0';
  } catch {
    return true;
  }
}

function drawRoundRect(ctx, x, y, width, height, radius) {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, width, height, radius);
    return;
  }
  const r = Math.min(radius, width / 2, height / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
}

function createDragPreviewIcon(icon, count, mode) {
  try {
    const canvas = document.createElement('canvas');
    const width = count > 1 ? 88 : 66;
    const height = 58;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    const ctx = canvas.getContext('2d');
    if (!ctx) return icon;
    ctx.scale(ratio, ratio);

    ctx.shadowColor = 'rgba(15, 23, 42, 0.2)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;

    const drawFallbackFile = (x, y, alpha) => {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = 'rgba(47, 123, 255, 0.5)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      drawRoundRect(ctx, x, y, 30, 36, 8);
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    const drawIconTile = (x, y, alpha) => {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.strokeStyle = 'rgba(47, 123, 255, 0.24)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      drawRoundRect(ctx, x, y, 36, 36, 9);
      ctx.fill();
      ctx.stroke();
      if (icon?.startsWith('data:image/')) {
        const image = new Image();
        image.src = icon;
        if (image.complete) {
          ctx.drawImage(image, x + 7, y + 7, 22, 22);
        } else {
          drawFallbackFile(x + 5, y + 3, 1);
        }
      } else {
        drawFallbackFile(x + 5, y + 3, 1);
      }
      ctx.globalAlpha = 1;
    };

    if (count > 1) {
      drawIconTile(16, 7, 0.72);
      drawIconTile(9, 14, 1);
    } else {
      drawIconTile(9, 12, 1);
    }

    ctx.shadowColor = 'transparent';
    if (count > 1) {
      ctx.fillStyle = mode === 'move' ? '#16a34a' : '#2f7bff';
      ctx.beginPath();
      ctx.arc(46, 14, 13, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = '700 13px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(Math.min(count, 99)), 46, 14.5);
    }

    ctx.fillStyle = mode === 'move' ? 'rgba(22, 163, 74, 0.92)' : 'rgba(47, 123, 255, 0.92)';
    ctx.beginPath();
    drawRoundRect(ctx, count > 1 ? 43 : 24, 33, 38, 18, 9);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 10px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(mode === 'move' ? '移动' : '复制', count > 1 ? 62 : 43, 42.5);

    return canvas.toDataURL('image/png');
  } catch {
    return icon;
  }
}

function getDragPreviewPlacement(event, root, count) {
  const rect = root?.getBoundingClientRect();
  const width = count > 1 ? 88 : 66;
  const height = 58;
  const gap = 12;
  if (!rect) {
    return { x: event.clientX + gap, y: event.clientY + gap };
  }

  const placeLeft = event.clientX + gap + width > rect.right;
  const placeTop = event.clientY + gap + height > rect.bottom;
  const x = placeLeft ? event.clientX - width - gap : event.clientX + gap;
  const y = placeTop ? event.clientY - height - gap : event.clientY + gap;

  return {
    x: Math.min(Math.max(x, rect.left + 4), rect.right - width - 4),
    y: Math.min(Math.max(y, rect.top + 4), rect.bottom - height - 4),
  };
}

export default function App() {
  const shelfId = useMemo(() => getShelfIdFromUrl(), []);
  const [files, setFiles] = useState([]);
  const [peers, setPeers] = useState([]);
  const [selectedPeerIds, setSelectedPeerIds] = useState([]);
  const [dropActive, setDropActive] = useState(false);
  const [task, setTask] = useState({ status: 'idle', total: 0, done: 0, failed: 0 });
  const [failedTargets, setFailedTargets] = useState([]);
  const [errorText, setErrorText] = useState('');
  const [restored, setRestored] = useState(false);
  const [viewMode, setViewMode] = useState(readStoredViewMode);
  const [peersCollapsed, setPeersCollapsed] = useState(readStoredPeersCollapsed);
  const [shelfName, setShelfName] = useState('文件盒');
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('文件盒');
  const [selectedFilePaths, setSelectedFilePaths] = useState([]);
  const [lastSelectedPath, setLastSelectedPath] = useState('');
  const [dragPreview, setDragPreview] = useState(null);
  const persistTimerRef = useRef(null);
  const geometryTimerRef = useRef(null);
  const filesPanelRef = useRef(null);
  const peersRef = useRef(null);
  const peersWrapperRef = useRef(null);
  const peersHeightRef = useRef(PEERS_BLOCK_FALLBACK);
  const animatingRef = useRef(false);
  const rootRef = useRef(null);

  const stagedSize = useMemo(
    () => files.reduce((total, file) => total + (Number(file.size) || 0), 0),
    [files],
  );
  const isSending = task.status === 'sending';
  const canSend = files.length > 0 && selectedPeerIds.length > 0 && !isSending;
  const canRetry = !isSending && failedTargets.length > 0;
  const selectedFileSet = useMemo(() => new Set(selectedFilePaths), [selectedFilePaths]);
  const activeFiles = useMemo(
    () => {
      const selected = files.filter((file) => selectedFileSet.has(file.path));
      return selected.length > 0 ? selected : files;
    },
    [files, selectedFileSet],
  );
  const validSelectedFileCount = files.filter((file) => selectedFileSet.has(file.path)).length;
  const selectedPeers = peers.filter((peer) => selectedPeerIds.includes(peer.device_id));
  const peersCountLabel = `${selectedPeers.length}/${peers.length}`;
  const sendTitle = !canSend
    ? (files.length === 0 ? '请先添加文件' : '请选择目标设备')
    : `发送 ${activeFiles.length} 个文件到 ${selectedPeers.length} 台设备`;

  const addPaths = async (paths) => {
    const uniquePaths = [...new Set(paths.filter((path) => typeof path === 'string' && path.length > 0))];
    if (uniquePaths.length === 0) return;

    const infos = await describeTransferShelfPaths(uniquePaths);
    setFiles((current) => {
      const next = new Map(current.map((file) => [file.path, file]));
      infos
        .filter((info) => info.exists && !info.isDir)
        .map(createFileItem)
        .forEach((item) => next.set(item.path, item));
      return Array.from(next.values());
    });
    setErrorText('');
  };

  // 启动时恢复持久化的暂存与窗口几何
  useEffect(() => {
    if (!shelfId) {
      setRestored(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const snapshot = await loadTransferShelfState(shelfId);
        if (cancelled || !snapshot) return;
        const restoredFiles = Array.isArray(snapshot.files)
          ? snapshot.files.filter((info) => info && !info.isDir).map(createFileItem)
          : [];
        if (restoredFiles.length > 0) setFiles(restoredFiles);
        if (typeof snapshot.name === 'string' && snapshot.name.trim()) {
          setShelfName(snapshot.name);
          setDraftName(snapshot.name);
          getCurrentWindow().setTitle(snapshot.name).catch(() => { });
        }
        if (Array.isArray(snapshot.selectedPeerIds) && snapshot.selectedPeerIds.length > 0) {
          setSelectedPeerIds(snapshot.selectedPeerIds);
        }
      } catch {
        // 持久化数据无效时静默忽略
      } finally {
        try {
          await applyTransferShelfGeometry(shelfId);
        } catch {
          // 几何无记录时正常
        }
        if (!cancelled) setRestored(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shelfId]);

  useEffect(() => {
    if (!shelfId) return;
    let unlisten = null;
    listen(FILES_DROPPED_EVENT, async (event) => {
      if (event.payload?.shelfId !== shelfId) return;
      const paths = Array.isArray(event.payload?.paths) ? event.payload.paths : [];
      if (paths.length === 0) return;
      setDropActive(false);
      await addPaths(paths);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, [shelfId]);

  useEffect(() => {
    if (!shelfId) return;
    let unlisten = null;
    listen(TASK_PROGRESS_EVENT, (event) => {
      const payload = event.payload || {};
      if (payload.shelfId !== shelfId) return;

      const errors = Array.isArray(payload.errors) ? payload.errors : [];
      setTask({
        status: payload.status || 'idle',
        total: Number(payload.total) || 0,
        done: Number(payload.done) || 0,
        failed: Number(payload.failed) || 0,
      });
      setFailedTargets(errors.map((item) => ({
        peerId: item.peerId,
        path: item.path,
        message: item.message || '',
      })));
      setErrorText(errors.length > 0 ? errors[errors.length - 1].message || '' : '');
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, [shelfId]);

  useEffect(() => {
    if (!shelfId) return;
    let unlisten = null;
    listen(DROP_ACTIVE_EVENT, (event) => {
      if (event.payload?.shelfId !== shelfId) return;
      setDropActive(Boolean(event.payload?.active));
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, [shelfId]);

  useEffect(() => {
    let cancelled = false;

    async function loadPeers() {
      try {
        const result = await listSyncTransferLanPairedPeers();
        if (!cancelled) setPeers(Array.isArray(result) ? result : []);
      } catch {
        if (!cancelled) setPeers([]);
      }
    }

    loadPeers();
    const timer = window.setInterval(loadPeers, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  // 文件队列与目标设备变化后防抖写入持久化
  useEffect(() => {
    if (!shelfId || !restored) return;
    if (persistTimerRef.current) {
      window.clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = window.setTimeout(() => {
      saveTransferShelfState(shelfId, files.map(toPersistedFile), selectedPeerIds).catch(() => {
        // 持久化失败不影响内存状态
      });
    }, PERSIST_DEBOUNCE_MS);
    return () => {
      if (persistTimerRef.current) {
        window.clearTimeout(persistTimerRef.current);
      }
    };
  }, [shelfId, restored, files, selectedPeerIds]);

  // 监听窗口位置 / 尺寸变化并防抖保存
  useEffect(() => {
    if (!shelfId) return;
    const win = getCurrentWindow();
    let unlistenMove = null;
    let unlistenResize = null;
    const schedule = () => {
      if (geometryTimerRef.current) {
        window.clearTimeout(geometryTimerRef.current);
      }
      geometryTimerRef.current = window.setTimeout(() => {
        saveTransferShelfGeometry(shelfId).catch(() => {
          // 写入失败不阻塞 UI
        });
      }, GEOMETRY_DEBOUNCE_MS);
    };
    win.onMoved(schedule).then((fn) => {
      unlistenMove = fn;
    });
    win.onResized(schedule).then((fn) => {
      unlistenResize = fn;
    });
    return () => {
      if (unlistenMove) unlistenMove();
      if (unlistenResize) unlistenResize();
      if (geometryTimerRef.current) {
        window.clearTimeout(geometryTimerRef.current);
      }
    };
  }, [shelfId]);

  // 视图模式持久化
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_KEY, viewMode);
    } catch {
      // ignore
    }
  }, [viewMode]);

  // 折叠状态持久化
  useEffect(() => {
    try {
      localStorage.setItem(PEERS_COLLAPSED_KEY, peersCollapsed ? '1' : '0');
    } catch {
      // ignore
    }
  }, [peersCollapsed]);

  useEffect(() => {
    const pathSet = new Set(files.map((file) => file.path));
    setSelectedFilePaths((current) => current.filter((path) => pathSet.has(path)));
    setLastSelectedPath((current) => (current && pathSet.has(current) ? current : ''));
  }, [files]);

  const removeFile = (path) => {
    setFiles((current) => current.filter((file) => file.path !== path));
    setFailedTargets((current) => current.filter((item) => item.path !== path));
    setSelectedFilePaths((current) => current.filter((item) => item !== path));
    setLastSelectedPath((current) => (current === path ? '' : current));
  };

  const clearFiles = () => {
    setFiles([]);
    setErrorText('');
    setFailedTargets([]);
    setSelectedFilePaths([]);
    setLastSelectedPath('');
    setTask({ status: 'idle', total: 0, done: 0, failed: 0 });
  };

  const selectFile = (event, path) => {
    if (event.shiftKey && lastSelectedPath) {
      const startIndex = files.findIndex((file) => file.path === lastSelectedPath);
      const endIndex = files.findIndex((file) => file.path === path);
      if (startIndex >= 0 && endIndex >= 0) {
        const [from, to] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
        const rangePaths = files.slice(from, to + 1).map((file) => file.path);
        setSelectedFilePaths((current) => Array.from(new Set([...current, ...rangePaths])));
        setLastSelectedPath(path);
        return;
      }
    }

    if (event.ctrlKey || event.metaKey) {
      setSelectedFilePaths((current) => (
        current.includes(path)
          ? current.filter((item) => item !== path)
          : [...current, path]
      ));
      setLastSelectedPath(path);
      return;
    }

    setSelectedFilePaths([path]);
    setLastSelectedPath(path);
  };

  const togglePeer = (deviceId) => {
    setSelectedPeerIds((current) => (
      current.includes(deviceId)
        ? current.filter((id) => id !== deviceId)
        : [...current, deviceId]
    ));
  };

  const selectFiles = async () => {
    const selected = await openFileDialog({ multiple: true, directory: false });
    const paths = Array.isArray(selected) ? selected : selected ? [selected] : [];
    if (paths.length > 0) {
      await addPaths(paths);
    }
  };

  const handleClose = async () => {
    if (files.length > 0) {
      const confirmed = await showConfirm(
        `文件盒里还有 ${files.length} 个暂存文件，关闭后会移除这些暂存引用，是否继续？`,
        '关闭文件盒',
      );
      if (!confirmed) return;
    }

    if (shelfId) {
      try {
        await closeTransferShelf(shelfId);
        return;
      } catch {
        // fall through to window close
      }
    }
    try {
      await getCurrentWindow().close();
    } catch {
      // ignore
    }
  };

  const handleMinimize = async () => {
    try {
      await getCurrentWindow().minimize();
    } catch {
      // ignore
    }
  };

  const handleStartDrag = async (event) => {
    if (event.button !== 0) return;
    if (event.target.closest([
      'button',
      'input',
      'textarea',
      'select',
      'a',
      '[data-no-window-drag]',
      '.shelf-file',
      '.shelf-peer',
      '.shelf-files__list',
      '.shelf-peers__inner',
      '.shelf-error',
    ].join(','))) return;
    if (event?.preventDefault) event.preventDefault();
    try {
      await getCurrentWindow().startDragging();
    } catch {
      // ignore
    }
  };

  const toggleViewMode = () => {
    setViewMode((mode) => (mode === 'list' ? 'grid' : 'list'));
  };

  const startEditName = () => {
    setDraftName(shelfName);
    setEditingName(true);
  };

  const cancelEditName = () => {
    setDraftName(shelfName);
    setEditingName(false);
  };

  const saveName = async () => {
    const nextName = draftName.trim();
    if (!nextName) {
      cancelEditName();
      return;
    }
    if (nextName === shelfName) {
      setEditingName(false);
      return;
    }
    try {
      const summary = await renameTransferShelf(shelfId, nextName);
      const savedName = summary?.name || nextName;
      setShelfName(savedName);
      setDraftName(savedName);
      await getCurrentWindow().setTitle(savedName).catch(() => { });
      setEditingName(false);
    } catch (error) {
      setErrorText(error?.message || String(error));
    }
  };

  const handleExternalDragMouseDown = useDragWithThreshold({
    onDragPending: ({ event, paths, mode, iconPath }) => {
      const placement = getDragPreviewPlacement(event, rootRef.current, paths.length);
      setDragPreview({
        x: placement.x,
        y: placement.y,
        count: paths.length,
        mode,
        iconPath,
      });
    },
    shouldStartDrag: (event) => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return true;
      return event.clientX < rect.left
        || event.clientX > rect.right
        || event.clientY < rect.top
        || event.clientY > rect.bottom;
    },
    onDragStart: () => {
      setDragPreview(null);
    },
    onDragCancel: () => {
      setDragPreview(null);
    },
    onDragEnd: async ({ paths, mode, result, cursorPos }) => {
      setDragPreview(null);
      if (mode !== 'move' || result !== 'Dropped' || !Array.isArray(paths) || paths.length === 0) return;
      if (cursorPos && Number.isFinite(cursorPos.x) && Number.isFinite(cursorPos.y)) {
        try {
          const win = getCurrentWindow();
          const position = await win.outerPosition();
          const size = await win.outerSize();
          const insideWindow = cursorPos.x >= position.x
            && cursorPos.x <= position.x + size.width
            && cursorPos.y >= position.y
            && cursorPos.y <= position.y + size.height;
          if (insideWindow) return;
        } catch {
          // 无法判断落点时继续按插件 Dropped 结果处理
        }
      }
      let movedPaths = [];
      try {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        const infos = await describeTransferShelfPaths(paths);
        movedPaths = Array.isArray(infos)
          ? infos.filter((info) => info && info.exists === false).map((info) => info.path)
          : [];
      } catch {
        movedPaths = [];
      }
      if (movedPaths.length === 0) return;

      const movedSet = new Set(movedPaths);
      setFiles((current) => current.filter((file) => !movedSet.has(file.path)));
      setFailedTargets((current) => current.filter((item) => !movedSet.has(item.path)));
      setSelectedFilePaths((current) => current.filter((path) => !movedSet.has(path)));
      setLastSelectedPath((current) => (movedSet.has(current) ? '' : current));
      setErrorText('');
    },
  });

  // 折叠/展开设备列表：冻结文件区，避免窗口尺寸变化时 flex 把中间区域推来推去
  const togglePeersCollapsed = async () => {
    if (animatingRef.current) return;
    const next = !peersCollapsed;
    const wrapper = peersWrapperRef.current;
    const inner = peersRef.current;
    const filesPanel = filesPanelRef.current;
    // 真实可见高度被 inner 的 max-height 夹住，不能直接用 scrollHeight
    const innerVisible = inner
      ? Math.min(inner.scrollHeight, PEERS_MAX_INNER)
      : PEERS_MAX_INNER;
    const targetWrapperH = innerVisible + PEERS_PADDING_TOP;
    if (innerVisible > 0) peersHeightRef.current = targetWrapperH;
    const delta = peersHeightRef.current || PEERS_BLOCK_FALLBACK;

    animatingRef.current = true;

    try {
      const win = getCurrentWindow();
      const factor = await win.scaleFactor();
      const innerSize = await win.innerSize();
      const logicalW = innerSize.width / factor;
      const currentLogicalH = innerSize.height / factor;
      const targetLogicalH = next
        ? Math.max(currentLogicalH - delta, 220)
        : currentLogicalH + delta;

      let frozenFilesHeight = 0;
      if (filesPanel) {
        frozenFilesHeight = filesPanel.getBoundingClientRect().height;
        filesPanel.style.flex = '0 0 auto';
        filesPanel.style.boxSizing = 'border-box';
        filesPanel.style.height = `${frozenFilesHeight}px`;
      }

      if (wrapper) {
        wrapper.style.transition = 'none';
        wrapper.style.overflow = 'hidden';
        wrapper.style.maxHeight = next ? `${targetWrapperH}px` : '0px';
        wrapper.style.paddingTop = next ? `${PEERS_PADDING_TOP}px` : '0px';
        wrapper.style.opacity = next ? '1' : '0';
        wrapper.style.pointerEvents = next ? '' : 'none';
      }

      if (!next) {
        await win.setSize(new LogicalSize(logicalW, targetLogicalH));
        setPeersCollapsed(false);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      } else {
        setPeersCollapsed(false);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }

      if (wrapper) {
        wrapper.style.transition = `max-height ${TOGGLE_ANIM_MS}ms cubic-bezier(0.4, 0, 0.2, 1), padding-top ${TOGGLE_ANIM_MS}ms cubic-bezier(0.4, 0, 0.2, 1), opacity ${TOGGLE_ANIM_MS - 20}ms ease`;
        wrapper.style.maxHeight = next ? '0px' : `${targetWrapperH}px`;
        wrapper.style.paddingTop = next ? '0px' : `${PEERS_PADDING_TOP}px`;
        wrapper.style.opacity = next ? '0' : '1';
        wrapper.style.pointerEvents = next ? 'none' : '';
      }

      await new Promise((resolve) => window.setTimeout(resolve, TOGGLE_ANIM_MS));

      if (next) {
        setPeersCollapsed(true);
        await win.setSize(new LogicalSize(logicalW, targetLogicalH));
      } else if (filesPanel && frozenFilesHeight > 0) {
        const diff = filesPanel.getBoundingClientRect().height - frozenFilesHeight;
        if (Math.abs(diff) > 0.25) {
          await win.setSize(new LogicalSize(logicalW, targetLogicalH - diff));
        }
      }

      if (wrapper) {
        wrapper.style.transition = '';
        wrapper.style.overflow = '';
        wrapper.style.maxHeight = '';
        wrapper.style.paddingTop = '';
        wrapper.style.opacity = '';
        wrapper.style.pointerEvents = '';
      }
      if (filesPanel) {
        filesPanel.style.flex = '';
        filesPanel.style.boxSizing = '';
        filesPanel.style.height = '';
      }
    } catch (error) {
      console.warn('调整文件盒窗口高度失败', error);
    } finally {
      if (filesPanel) {
        filesPanel.style.flex = '';
        filesPanel.style.boxSizing = '';
        filesPanel.style.height = '';
      }
      animatingRef.current = false;
    }
  };

  // 把 (peer, file) 对作为单元发送，便于失败时只重试失败项
  const runSendBatch = async (targets) => {
    if (!Array.isArray(targets) || targets.length === 0) return;
    const fileMap = new Map(files.map((file) => [file.path, file]));
    const peerSet = new Set(peers.map((peer) => peer.device_id));

    const validTargets = targets.filter((target) => fileMap.has(target.path) && peerSet.has(target.peerId));
    if (validTargets.length === 0) {
      setErrorText('暂存或目标设备已变化，请检查后重试');
      return;
    }

    setErrorText('');
    setFailedTargets([]);
    setTask({ status: 'sending', total: validTargets.length, done: 0, failed: 0 });

    try {
      const result = await sendTransferShelf(shelfId, validTargets);
      const errors = Array.isArray(result?.errors) ? result.errors : [];
      setFailedTargets(errors.map((item) => ({
        peerId: item.peerId,
        path: item.path,
        message: item.message || '',
      })));
      setTask({
        status: result?.status || (errors.length > 0 ? 'failed' : 'done'),
        total: Number(result?.total) || validTargets.length,
        done: Number(result?.done) || 0,
        failed: Number(result?.failed) || errors.length,
      });
      setErrorText(errors.length > 0 ? errors[errors.length - 1].message || '' : '');
    } catch (error) {
      const message = error?.message || String(error);
      setErrorText(message);
      setTask({ status: 'failed', total: validTargets.length, done: 0, failed: validTargets.length });
    }
  };

  const sendFiles = async () => {
    if (!canSend) return;
    const targets = [];
    for (const peerId of selectedPeerIds) {
      for (const file of activeFiles) {
        targets.push({ peerId, path: file.path });
      }
    }
    await runSendBatch(targets);
  };

  const retryFailed = async () => {
    if (!canRetry) return;
    await runSendBatch(failedTargets);
  };

  return (
    <main ref={rootRef} className={`shelf-root ${dropActive ? 'is-drop-active' : ''}`} onPointerDown={handleStartDrag}>
      <section className="shelf-shell">
        <header className="shelf-header">
          {!editingName && (
            <button
              type="button"
              className="shelf-header__rename"
              title="重命名"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={startEditName}
            >
              <i className="ti ti-pencil" />
            </button>
          )}
          {editingName ? (
            <input
              className="shelf-header__name-input"
              value={draftName}
              maxLength={48}
              autoFocus
              onPointerDown={(event) => event.stopPropagation()}
              onChange={(event) => setDraftName(event.target.value)}
              onBlur={saveName}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  saveName();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  cancelEditName();
                }
              }}
            />
          ) : (
            <span className="shelf-header__title" title={shelfName}>
              {shelfName}
            </span>
          )}
          <div className="shelf-header__actions" onPointerDown={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="shelf-icon-btn"
              title={viewMode === 'list' ? '切换到宫格视图' : '切换到列表视图'}
              onClick={toggleViewMode}
            >
              <i className={`ti ${viewMode === 'list' ? 'ti-layout-grid' : 'ti-layout-list'}`} />
            </button>
            <button type="button" className="shelf-icon-btn" title="最小化" onClick={handleMinimize}>
              <i className="ti ti-minus" />
            </button>
            <button type="button" className="shelf-icon-btn is-danger" title="关闭" onClick={handleClose}>
              <i className="ti ti-x" />
            </button>
          </div>
        </header>

        <section className="shelf-files" ref={filesPanelRef}>
          {files.length === 0 ? (
            <div className="shelf-files__empty">
              <span className="shelf-files__empty-icon">
                <i className="ti ti-cloud-upload" />
              </span>
              <span className="shelf-files__empty-title">把文件拖到这里</span>
            </div>
          ) : (
            <div className={`shelf-files__list ${viewMode === 'grid' ? 'is-grid' : ''}`}>
              {files.map((file) => {
                const failedCount = failedTargets.filter((target) => target.path === file.path).length;
                const missing = file.exists === false;
                const selected = selectedFileSet.has(file.path);
                const canExternalDrag = !missing;
                const dragFiles = selected
                  ? files.filter((item) => selectedFileSet.has(item.path) && item.exists !== false)
                  : [file];
                const dragPaths = dragFiles.map((item) => item.path);
                const className = [
                  'shelf-file',
                  canExternalDrag ? 'is-draggable' : '',
                  selected ? 'is-selected' : '',
                  missing ? 'is-missing' : '',
                  failedCount > 0 ? 'is-failed' : '',
                ].filter(Boolean).join(' ');
                const sizeLabel = missing ? '文件不存在' : formatSize(file.size);
                return (
                  <div
                    className={className}
                    key={file.path}
                    title={canExternalDrag ? `${file.name}\n${selected && dragPaths.length > 1 ? `拖出 ${dragPaths.length} 个选中文件` : '拖到外部程序'}，Shift 拖拽为移动` : file.name}
                    onClick={(event) => selectFile(event, file.path)}
                    onMouseDown={canExternalDrag
                      ? (event) => {
                        const dragMode = event.shiftKey ? 'move' : 'copy';
                        const dragIcon = createDragPreviewIcon(
                          dragFiles.find((item) => item.icon)?.icon || '',
                          dragPaths.length,
                          dragMode,
                        ) || dragPaths[0];
                        handleExternalDragMouseDown(event, dragPaths, dragIcon, dragMode);
                      }
                      : undefined}
                  >
                    <span className="shelf-file__icon">
                      {!missing && file.icon ? (
                        <img src={file.icon} alt="" draggable={false} />
                      ) : (
                        <i className={`ti ${missing ? 'ti-file-off' : 'ti-file'}`} />
                      )}
                    </span>
                    <div className="shelf-file__meta">
                      <span className="shelf-file__name">{file.name}</span>
                      <span className="shelf-file__size">
                        {sizeLabel}
                        {failedCount > 0 && <span className="shelf-file__badge">失败 {failedCount}</span>}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="shelf-icon-btn shelf-file__remove"
                      title="移除"
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        removeFile(file.path);
                      }}
                    >
                      <i className="ti ti-x" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <footer className="shelf-dock">
          <div className="shelf-dock__row">
            <button
              type="button"
              className="shelf-send"
              disabled={!canSend}
              onClick={sendFiles}
              title={sendTitle}
              aria-label={sendTitle}
            >
              <i className={`ti ${isSending ? 'ti-loader-2 shelf-spin' : 'ti-send'}`} />
            </button>
            <button type="button" className="shelf-icon-btn" title="添加文件" onClick={selectFiles}>
              <i className="ti ti-plus" />
            </button>
            <button
              type="button"
              className="shelf-icon-btn is-danger"
              title="清空"
              disabled={files.length === 0}
              onClick={clearFiles}
            >
              <i className="ti ti-trash" />
            </button>
            {canRetry && (
              <button
                type="button"
                className="shelf-icon-btn"
                title={`重试 ${failedTargets.length} 个失败项`}
                onClick={retryFailed}
              >
                <i className="ti ti-refresh" />
              </button>
            )}
            <span className="shelf-dock__progress">
              {task.status === 'idle' && validSelectedFileCount > 0 && `已选 ${validSelectedFileCount}`}
              {task.status !== 'idle' && (
                isSending
                  ? `${task.done}/${task.total}`
                  : task.status === 'done'
                    ? '完成'
                    : `失败 ${task.failed}/${task.total}`
              )}
            </span>
            <button
              type="button"
              className="shelf-icon-btn shelf-dock__toggle"
              title={peersCollapsed
                ? `展开设备列表（已选 ${peersCountLabel}）`
                : `折叠设备列表（已选 ${peersCountLabel}）`}
              onClick={togglePeersCollapsed}
            >
              <i className={`ti ${peersCollapsed ? 'ti-chevron-down' : 'ti-chevron-up'}`} />
            </button>
          </div>

          <div
            className={`shelf-peers ${peersCollapsed ? 'is-collapsed' : ''}`}
            aria-hidden={peersCollapsed}
            ref={peersWrapperRef}
          >
            <div className="shelf-peers__inner" ref={peersRef}>
              {peers.length === 0 ? (
                <div className="shelf-peers__empty">暂无配对设备</div>
              ) : (
                peers.map((peer) => {
                  const selected = selectedPeerIds.includes(peer.device_id);
                  const name = peer.device_name || peer.name || '未命名';
                  return (
                    <button
                      type="button"
                      key={peer.device_id}
                      className={`shelf-peer ${selected ? 'is-selected' : ''}`}
                      title={name}
                      onClick={() => togglePeer(peer.device_id)}
                      tabIndex={peersCollapsed ? -1 : 0}
                    >
                      <span className="shelf-peer__icon">
                        <i className={`ti ${selected ? 'ti-check' : 'ti-device-desktop'}`} />
                      </span>
                      <span className="shelf-peer__name">{name}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {errorText && <div className="shelf-error" title={errorText}>{errorText}</div>}
        </footer>
      </section>
      {dragPreview && (
        <div
          className="shelf-drag-preview"
          style={{
            transform: `translate3d(${dragPreview.x}px, ${dragPreview.y}px, 0)`,
          }}
        >
          {dragPreview.iconPath?.startsWith('data:image/') ? (
            <img src={dragPreview.iconPath} alt="" draggable={false} />
          ) : (
            <span className="shelf-drag-preview__fallback">
              <i className="ti ti-file" />
            </span>
          )}
        </div>
      )}
    </main>
  );
}
