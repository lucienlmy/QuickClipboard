import { useEffect, useMemo, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
import {
  applyTransferShelfGeometry,
  closeTransferShelf,
  describeTransferShelfPaths,
  listSyncTransferLanPairedPeers,
  loadTransferShelfState,
  saveTransferShelfGeometry,
  saveTransferShelfState,
  sendSyncTransferLanFileToPeer,
} from '@shared/api';

const FILES_DROPPED_EVENT = 'transfer-shelf-files-dropped';
const DROP_ACTIVE_EVENT = 'transfer-shelf-drop-active';
const PERSIST_DEBOUNCE_MS = 400;
const GEOMETRY_DEBOUNCE_MS = 400;

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
  const persistTimerRef = useRef(null);
  const geometryTimerRef = useRef(null);


  const stagedSize = useMemo(
    () => files.reduce((total, file) => total + (Number(file.size) || 0), 0),
    [files],
  );
  const isSending = task.status === 'sending';
  const canSend = files.length > 0 && selectedPeerIds.length > 0 && !isSending;
  const canRetry = !isSending && failedTargets.length > 0;

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

  const removeFile = (path) => {
    setFiles((current) => current.filter((file) => file.path !== path));
    setFailedTargets((current) => current.filter((item) => item.path !== path));
  };

  const clearFiles = () => {
    setFiles([]);
    setErrorText('');
    setFailedTargets([]);
    setTask({ status: 'idle', total: 0, done: 0, failed: 0 });
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
    if (event?.preventDefault) event.preventDefault();
    try {
      await getCurrentWindow().startDragging();
    } catch {
      // ignore
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

    const total = validTargets.length;
    let done = 0;
    let failed = 0;
    const newFailed = [];
    setErrorText('');
    setTask({ status: 'sending', total, done, failed });

    for (const target of validTargets) {
      try {
        await sendSyncTransferLanFileToPeer(target.peerId, target.path);
        done += 1;
      } catch (error) {
        failed += 1;
        newFailed.push({ ...target, message: error?.message || String(error) });
        setErrorText(error?.message || String(error));
      }
      setTask({ status: 'sending', total, done, failed });
    }

    setFailedTargets(newFailed);
    setTask({ status: failed > 0 ? 'failed' : 'done', total, done, failed });
  };

  const sendFiles = async () => {
    if (!canSend) return;
    const targets = [];
    for (const peerId of selectedPeerIds) {
      for (const file of files) {
        targets.push({ peerId, path: file.path });
      }
    }
    await runSendBatch(targets);
  };

  const retryFailed = async () => {
    if (!canRetry) return;
    await runSendBatch(failedTargets);
  };

  const selectedPeers = peers.filter((peer) => selectedPeerIds.includes(peer.device_id));
  const headerSubtitle = files.length > 0
    ? `${files.length} 个文件 · ${formatSize(stagedSize)}`
    : '把文件拖到这里';

  return (
    <main className={`shelf-root ${dropActive ? 'is-drop-active' : ''}`}>
      <section className="shelf-shell">
        <header className="shelf-header" onPointerDown={handleStartDrag}>
          <div className="shelf-header__brand">
            <span className="shelf-header__logo">
              <i className="ti ti-package" />
            </span>
            <div className="shelf-header__text">
              <span className="shelf-header__title">文件中转架</span>
              <span className="shelf-header__subtitle">{headerSubtitle}</span>
            </div>
          </div>
          <div className="shelf-header__actions" onPointerDown={(event) => event.stopPropagation()}>
            <button type="button" className="shelf-icon-btn" title="最小化" onClick={handleMinimize}>
              <i className="ti ti-minus" />
            </button>
            <button type="button" className="shelf-icon-btn is-danger" title="关闭" onClick={handleClose}>
              <i className="ti ti-x" />
            </button>
          </div>
        </header>

        <section className="shelf-files">
          {files.length === 0 ? (
            <div className="shelf-files__empty">
              <span className="shelf-files__empty-icon">
                <i className="ti ti-cloud-upload" />
              </span>
              <span className="shelf-files__empty-title">等待文件</span>
              <span className="shelf-files__empty-hint">把文件拖到这里，或点击下方加号添加</span>
            </div>
          ) : (
            <div className="shelf-files__list">
              {files.map((file) => {
                const failedCount = failedTargets.filter((target) => target.path === file.path).length;
                const missing = file.exists === false;
                const className = [
                  'shelf-file',
                  missing ? 'is-missing' : '',
                  failedCount > 0 ? 'is-failed' : '',
                ].filter(Boolean).join(' ');
                const sizeLabel = missing ? '文件不存在' : formatSize(file.size);
                return (
                  <div className={className} key={file.path}>
                    <span className="shelf-file__icon">
                      <i className={`ti ${missing ? 'ti-file-off' : 'ti-file'}`} />
                    </span>
                    <div className="shelf-file__meta">
                      <span className="shelf-file__name" title={file.name}>{file.name}</span>
                      <span className="shelf-file__size">
                        {sizeLabel}
                        {failedCount > 0 && <span className="shelf-file__badge">失败 {failedCount}</span>}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="shelf-icon-btn"
                      title="移除"
                      onClick={() => removeFile(file.path)}
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
            <span className="shelf-dock__caption">
              发送到 <strong>{selectedPeers.length > 0 ? `${selectedPeers.length} 台设备` : '未选择'}</strong>
            </span>
          </div>

          <div className="shelf-peers">
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

          {errorText && <div className="shelf-error" title={errorText}>{errorText}</div>}

          <div className="shelf-dock__send">
            <div className="shelf-dock__progress">
              {task.status !== 'idle' && (
                <span>
                  {isSending && `发送中 ${task.done}/${task.total}`}
                  {task.status === 'done' && '发送完成'}
                  {task.status === 'failed' && `失败 ${task.failed} 个 / 共 ${task.total}`}
                </span>
              )}
            </div>
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
            <button
              type="button"
              className="shelf-send"
              disabled={!canSend}
              onClick={sendFiles}
              title="发送"
            >
              <i className={`ti ${isSending ? 'ti-loader-2 shelf-spin' : 'ti-send'}`} />
              <span>发送</span>
            </button>
          </div>
        </footer>
      </section>
    </main>
  );
}
