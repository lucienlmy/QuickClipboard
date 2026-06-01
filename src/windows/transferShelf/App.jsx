import { useEffect, useMemo, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
import {
  closeTransferShelf,
  describeTransferShelfPaths,
  listSyncTransferLanPairedPeers,
  sendSyncTransferLanFileToPeer,
} from '@shared/api';

const FILES_DROPPED_EVENT = 'transfer-shelf-files-dropped';
const DROP_ACTIVE_EVENT = 'transfer-shelf-drop-active';

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

export default function App() {
  const shelfId = useMemo(() => getShelfIdFromUrl(), []);
  const [files, setFiles] = useState([]);
  const [peers, setPeers] = useState([]);
  const [selectedPeerIds, setSelectedPeerIds] = useState([]);
  const [dropActive, setDropActive] = useState(false);
  const [task, setTask] = useState({ status: 'idle', total: 0, done: 0, failed: 0 });
  const [errorText, setErrorText] = useState('');

  const stagedSize = useMemo(
    () => files.reduce((total, file) => total + (Number(file.size) || 0), 0),
    [files],
  );
  const isSending = task.status === 'sending';
  const canSend = files.length > 0 && selectedPeerIds.length > 0 && !isSending;

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

  const removeFile = (path) => {
    setFiles((current) => current.filter((file) => file.path !== path));
  };

  const clearFiles = () => {
    setFiles([]);
    setErrorText('');
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

  const sendFiles = async () => {
    if (!canSend) return;

    const total = files.length * selectedPeerIds.length;
    let done = 0;
    let failed = 0;
    setErrorText('');
    setTask({ status: 'sending', total, done, failed });

    for (const peerId of selectedPeerIds) {
      for (const file of files) {
        try {
          await sendSyncTransferLanFileToPeer(peerId, file.path);
          done += 1;
        } catch (error) {
          failed += 1;
          setErrorText(error?.message || String(error));
        }
        setTask({ status: 'sending', total, done, failed });
      }
    }

    setTask({ status: failed > 0 ? 'failed' : 'done', total, done, failed });
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
              {files.map((file) => (
                <div className="shelf-file" key={file.path}>
                  <span className="shelf-file__icon">
                    <i className="ti ti-file" />
                  </span>
                  <div className="shelf-file__meta">
                    <span className="shelf-file__name" title={file.name}>{file.name}</span>
                    <span className="shelf-file__size">{formatSize(file.size)}</span>
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
              ))}
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
