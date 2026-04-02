import { useEffect, useMemo, useRef, useState } from 'react';
import { useSnapshot } from 'valtio';
import { open } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import { useTranslation } from 'react-i18next';
import { chatStore } from '@shared/store/chatStore';
import { settingsStore } from '@shared/store/settingsStore';
import { useCustomScrollbar } from '@shared/hooks/useCustomScrollbar';
import { focusWindowImmediately, useInputFocus } from '@shared/hooks/useInputFocus';
import { copyTextToClipboard } from '@shared/api/system';
import { toast } from '@shared/store/toastStore';
import Tooltip from '@shared/components/common/Tooltip.jsx';
import { createMenuItem, showContextMenuFromEvent } from '@/plugins/context_menu/index.js';
import {
  acceptLanChatFileOffer,
  prepareLanChatFiles,
  ensureLanChatDropProxy,
  showLanChatDropProxy,
  hideLanChatDropProxy,
  disposeLanChatDropProxy,
  revealLanChatFile,
  rejectLanChatFileOffer,
  sendLanChatFileOffer,
  sendLanChatText
} from '@shared/api/chat';

function formatFileSize(size) {
  const n = Number(size || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function normalizePreparedFiles(rawFiles) {
  if (!Array.isArray(rawFiles)) return [];

  return rawFiles
    .map((item) => {
      const fileId = item?.file_id ?? item?.fileId;
      const fileName = item?.file_name ?? item?.fileName;
      const filePath = item?.file_path ?? item?.filePath;
      const fileSizeRaw = item?.file_size ?? item?.fileSize ?? 0;
      const fileSize = Number(fileSizeRaw);

      return {
        file_id: typeof fileId === 'string' ? fileId : '',
        file_name: typeof fileName === 'string' ? fileName : '',
        file_path: typeof filePath === 'string' ? filePath : '',
        file_size: Number.isFinite(fileSize) ? fileSize : 0
      };
    })
    .filter((item) => item.file_id && item.file_name && item.file_path);
}

function getTopFolderName(fileName) {
  const normalized = String(fileName || '').replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length < 2) return '';
  return parts[0] || '';
}

function buildDisplayEntries(files) {
  const out = new Map();
  const list = Array.isArray(files) ? files : [];

  list.forEach((f, idx) => {
    const folderName = getTopFolderName(f?.file_name);
    if (folderName) {
      const key = `folder:${folderName.toLowerCase()}`;
      const size = Number(f?.file_size || 0);
      if (!out.has(key)) {
        out.set(key, {
          key,
          kind: 'folder',
          folderName,
          totalSize: 0,
          fileCount: 0
        });
      }
      const target = out.get(key);
      target.totalSize += Number.isFinite(size) ? size : 0;
      target.fileCount += 1;
      return;
    }

    const fileId = String(f?.file_id || `unknown-${idx}`);
    out.set(`file:${fileId}`, {
      key: `file:${fileId}`,
      kind: 'file',
      fileId,
      fileName: String(f?.file_name || ''),
      fileSize: Number(f?.file_size || 0)
    });
  });

  return Array.from(out.values());
}

function statusText(message, now, t) {
  if (message.status === 'waiting_accept' || message.status === 'pending') {
    if (typeof message.expire_at_ms === 'number' && now > message.expire_at_ms) {
      return t('chat.status.expired');
    }
  }
  if (message.status === 'waiting_accept') return t('chat.status.waitingAccept');
  if (message.status === 'pending') return t('chat.status.pending');
  if (message.status === 'transferring') return t('chat.status.transferring', { progress: message.progress || 0 });
  if (message.status === 'rejected') return t('chat.status.rejected');
  if (message.status === 'expired') return t('chat.status.expired');
  if (message.status === 'done') return t('chat.status.done');
  if (message.status === 'failed') return t('chat.status.failed');
  return '';
}

let latestComposerHeight = 120;
const DRAG_SESSION_TIMEOUT_MS = 10_000;

function ChatTab() {
  const { t } = useTranslation();
  const chat = useSnapshot(chatStore);
  const settings = useSnapshot(settingsStore);
  const [inputText, setInputText] = useState('');
  const [pendingFiles, setPendingFiles] = useState([]);
  const [tick, setTick] = useState(0);
  const [composerHeight, setComposerHeight] = useState(latestComposerHeight);
  const [isDragHighlightVisible, setIsDragHighlightVisible] = useState(false);
  const [sendHotkeyMode, setSendHotkeyMode] = useState('enter');
  const [messageScrollerElement, setMessageScrollerElement] = useState(null);
  const [selectionCopy, setSelectionCopy] = useState({
    visible: false,
    text: '',
    x: 0,
    y: 0
  });
  const inputRef = useInputFocus();
  const rootRef = useRef(null);
  const messageListRef = useRef(null);
  const lastMessageCountRef = useRef(0);
  const dragStartYRef = useRef(0);
  const dragStartHeightRef = useRef(120);
  const isDropProxyShownRef = useRef(false);
  const dragSessionTimeoutRef = useRef(null);
  const dragSessionTimedOutRef = useRef(false);
  useCustomScrollbar(messageScrollerElement);

  useEffect(() => {
    chatStore.init();
    const timer = setInterval(() => {
      setTick((x) => x + 1);
      chatStore.refreshDevices();
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let unlistenPaths = null;
    let unlistenLeave = null;

    const clearDragSessionTimeout = () => {
      if (dragSessionTimeoutRef.current) {
        clearTimeout(dragSessionTimeoutRef.current);
        dragSessionTimeoutRef.current = null;
      }
    };

    const cleanupProxy = async () => {
      clearDragSessionTimeout();
      setIsDragHighlightVisible(false);
      isDropProxyShownRef.current = false;
      await hideLanChatDropProxy().catch(() => {});
    };

    const setupDropProxy = async () => {
      unlistenPaths = await listen('chat-drop-proxy-paths', async (event) => {
        const payload = event?.payload || {};
        const paths = Array.isArray(payload.paths) ? payload.paths.filter((p) => typeof p === 'string' && p.trim()) : [];
        if (paths.length === 0) {
          return;
        }
        try {
          const rawFileItems = await prepareLanChatFiles(paths);
          const fileItems = normalizePreparedFiles(rawFileItems);
          if (fileItems.length === 0) {
            toast.warning(t('chat.toast.noValidFiles'));
          } else {
            setPendingFiles((prev) => [...prev, ...fileItems]);
          }
        } catch (e) {
          toast.error(t('chat.toast.addFileFailed', { message: String(e) }));
        } finally {
          await cleanupProxy();
        }
      });

      unlistenLeave = await listen('chat-drop-proxy-leave', async () => {
        await cleanupProxy();
      });

      ensureLanChatDropProxy().catch(() => {});
    };

    const handleWindowDropEnd = () => {
      dragSessionTimedOutRef.current = false;
      cleanupProxy().catch(() => {});
    };

    window.addEventListener('drop', handleWindowDropEnd);
    window.addEventListener('dragend', handleWindowDropEnd);

    setupDropProxy();

    return () => {
      if (typeof unlistenPaths === 'function') {
        unlistenPaths();
      }
      if (typeof unlistenLeave === 'function') {
        unlistenLeave();
      }
      window.removeEventListener('drop', handleWindowDropEnd);
      window.removeEventListener('dragend', handleWindowDropEnd);
      cleanupProxy().catch(() => {});
      disposeLanChatDropProxy().catch(() => {});
    };
  }, []);

  const currentDeviceId = chat.currentDeviceId || '';
  const hasPendingFiles = pendingFiles.length > 0;
  const session = currentDeviceId ? chat.sessions[currentDeviceId] : null;
  const messages = useMemo(() => {
    if (!session?.messages) return [];
    return [...session.messages].sort((a, b) => (a.sent_at_ms || 0) - (b.sent_at_ms || 0));
  }, [session, tick]);

  const scrollMessagesToBottom = () => {
    const el = messageListRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  };

  const hideSelectionCopy = () => {
    setSelectionCopy((prev) => (prev.visible
      ? {
          visible: false,
          text: '',
          x: 0,
          y: 0
        }
      : prev));
  };

  const updateSelectionCopyFromDOM = () => {
    const container = messageListRef.current;
    if (!container) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      hideSelectionCopy();
      return;
    }

    const selectedText = selection.toString().trim();
    if (!selectedText) {
      hideSelectionCopy();
      return;
    }

    const range = selection.getRangeAt(0);
    const common = range.commonAncestorContainer;
    const commonEl = common.nodeType === 1 ? common : common.parentElement;
    if (!commonEl || !container.contains(commonEl)) {
      hideSelectionCopy();
      return;
    }

    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      hideSelectionCopy();
      return;
    }

    const rootRect = rootRef.current?.getBoundingClientRect();
    if (!rootRect) {
      hideSelectionCopy();
      return;
    }

    const x = Math.max(8, Math.min(rootRect.width - 36, rect.right - rootRect.left + 6));
    const y = Math.max(8, rect.top - rootRect.top - 28);
    setSelectionCopy({
      visible: true,
      text: selectedText,
      x,
      y
    });
  };

  useEffect(() => {
    const currentCount = messages.length;
    const previousCount = lastMessageCountRef.current;
    if (currentCount > previousCount) {
      scrollMessagesToBottom();
    }
    lastMessageCountRef.current = currentCount;
  }, [messages.length, currentDeviceId]);

  useEffect(() => {
    const container = messageListRef.current;
    if (!container) return undefined;

    const onMouseUp = () => {
      setTimeout(updateSelectionCopyFromDOM, 0);
    };
    const onKeyUp = () => {
      setTimeout(updateSelectionCopyFromDOM, 0);
    };
    const onScroll = () => {
      hideSelectionCopy();
    };

    container.addEventListener('mouseup', onMouseUp);
    container.addEventListener('keyup', onKeyUp);
    container.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      container.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('keyup', onKeyUp);
      container.removeEventListener('scroll', onScroll);
    };
  }, [messages.length, currentDeviceId]);

  const chooseFiles = async (event) => {
    try {
      const menuItems = [
        createMenuItem('pick-files', t('chat.dialog.pickFiles'), {
          icon: 'ti ti-files'
        }),
        createMenuItem('pick-folder', t('chat.dialog.pickFolder'), {
          icon: 'ti ti-folder'
        })
      ];
      const action = await showContextMenuFromEvent(event, menuItems, {
        theme: settings.theme,
        darkThemeStyle: settings.darkThemeStyle
      });
      if (!action) return;
      const pickFolder = action === 'pick-folder';

      const selected = pickFolder
        ? await open({
            multiple: true,
            directory: true
          })
        : await open({
            multiple: true,
            directory: false
          });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      const normalizedPaths = paths.filter((p) => typeof p === 'string' && p.trim());
      const rawFileItems = await prepareLanChatFiles(normalizedPaths);
      const fileItems = normalizePreparedFiles(rawFileItems);
      if (fileItems.length === 0) {
        toast.warning(t('chat.toast.noValidFiles'));
        return;
      }
      setPendingFiles((prev) => [...prev, ...fileItems]);
    } catch (e) {
      toast.error(t('chat.toast.addFileFailed', { message: String(e) }));
    }
  };

  const removePendingFile = (fileId) => {
    setPendingFiles((prev) => prev.filter((f) => f.file_id !== fileId));
  };

  const removePendingEntry = (entry) => {
    if (!entry) return;
    if (entry.kind === 'folder') {
      setPendingFiles((prev) => prev.filter((f) => getTopFolderName(f.file_name) !== entry.folderName));
      return;
    }
    removePendingFile(entry.fileId);
  };

  const sendMessage = async () => {
    if (!currentDeviceId) return;
    const text = inputText.trim();
    if (!text && pendingFiles.length === 0) return;
    if (pendingFiles.length > 0) {
      const offer = await sendLanChatFileOffer(currentDeviceId, text || null, pendingFiles);
      chatStore.addLocalFileOffer(offer);
      setPendingFiles([]);
    } else if (text) {
      const msg = await sendLanChatText(currentDeviceId, text);
      chatStore.addLocalText(msg);
    }
    setInputText('');
    scrollMessagesToBottom();
  };

  const handleTextareaKeyDown = async (event) => {
    if (event.key !== 'Enter') return;

    const isEnterModeSend =
      sendHotkeyMode === 'enter' &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey;

    const isCtrlEnterModeSend =
      sendHotkeyMode === 'ctrl_enter' &&
      (event.ctrlKey || event.metaKey) &&
      !event.shiftKey &&
      !event.altKey;

    if (!isEnterModeSend && !isCtrlEnterModeSend) {
      return;
    }

    event.preventDefault();
    await sendMessage();
  };

  const openSendHotkeyMenu = async (event) => {
    const menuItems = [
      createMenuItem('send-hotkey-enter', t('chat.sendHotkey.enter'), {
        icon: sendHotkeyMode === 'enter' ? 'ti ti-check' : 'ti ti-corner-down-right'
      }),
      createMenuItem('send-hotkey-ctrl-enter', t('chat.sendHotkey.ctrlEnter'), {
        icon: sendHotkeyMode === 'ctrl_enter' ? 'ti ti-check' : 'ti ti-corner-down-right'
      })
    ];

    const action = await showContextMenuFromEvent(event, menuItems, {
      theme: settings.theme,
      darkThemeStyle: settings.darkThemeStyle
    });

    if (action === 'send-hotkey-enter') {
      setSendHotkeyMode('enter');
    } else if (action === 'send-hotkey-ctrl-enter') {
      setSendHotkeyMode('ctrl_enter');
    }
  };

  const acceptOffer = async (message) => {
    await acceptLanChatFileOffer(message.transfer_id, currentDeviceId);
    chatStore.markTransferStatus(message.transfer_id, 'transferring');
  };

  const rejectOffer = async (message) => {
    await rejectLanChatFileOffer(message.transfer_id, currentDeviceId);
    chatStore.markTransferStatus(message.transfer_id, 'rejected');
  };

  const revealFile = async (message) => {
    const paths = Array.isArray(message.received_paths) ? message.received_paths : [];
    if (paths.length === 0) {
      toast.warning(t('chat.toast.noRevealableFile'));
      return;
    }
    try {
      await revealLanChatFile(paths[0]);
    } catch (e) {
      toast.error(t('chat.toast.revealFailed', { message: String(e) }));
    }
  };

  const copySelectionText = async () => {
    const text = String(selectionCopy.text || '').trim();
    if (!text) {
      hideSelectionCopy();
      return;
    }
    try {
      await copyTextToClipboard(text);
      toast.success(t('common.copied'));
    } catch (_e) {
      toast.error(t('common.copyFailed'));
    } finally {
      hideSelectionCopy();
      try {
        window.getSelection()?.removeAllRanges();
      } catch (_err) {}
    }
  };

  const startResizeComposer = (event) => {
    event.preventDefault();
    event.stopPropagation();
    dragStartYRef.current = event.clientY;
    dragStartHeightRef.current = composerHeight;

    const onMove = (moveEvent) => {
      const delta = dragStartYRef.current - moveEvent.clientY;
      const next = Math.max(120, Math.min(420, dragStartHeightRef.current + delta));
      setComposerHeight(next);
      latestComposerHeight = next;
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleTextareaClick = async () => {
    try {
      await focusWindowImmediately();
      inputRef.current?.focus();
    } catch (_e) {
    }
  };

  const isLikelyLocalFileDrag = (event) => {
    const dt = event?.dataTransfer;
    if (!dt) return false;

    const types = Array.from(dt.types || []);
    if (types.includes('text/uri-list') || types.includes('text/html')) {
      return false;
    }

    if (dt.items && dt.items.length > 0) {
      return Array.from(dt.items).some((item) => item.kind === 'file');
    }
    return types.includes('Files');
  };

  const showDropProxyForCurrentBounds = async () => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    await showLanChatDropProxy({
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height
    });
    isDropProxyShownRef.current = true;
  };

  const startDragSessionTimeout = () => {
    if (dragSessionTimeoutRef.current) return;
    dragSessionTimeoutRef.current = setTimeout(() => {
      dragSessionTimeoutRef.current = null;
      dragSessionTimedOutRef.current = true;
      setIsDragHighlightVisible(false);
      isDropProxyShownRef.current = false;
      hideLanChatDropProxy().catch(() => {});
      toast.warning(t('chat.toast.dragTimeoutCancelled'));
    }, DRAG_SESSION_TIMEOUT_MS);
  };

  const handleChatDragEnter = async (event) => {
    if (!isLikelyLocalFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (dragSessionTimedOutRef.current) {
      return;
    }
    setIsDragHighlightVisible(true);
    startDragSessionTimeout();
    await showDropProxyForCurrentBounds();
  };

  const handleChatDragOver = async (event) => {
    if (!isLikelyLocalFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (dragSessionTimedOutRef.current) {
      return;
    }
    if (!isDragHighlightVisible) {
      setIsDragHighlightVisible(true);
    }
    startDragSessionTimeout();
    if (!isDropProxyShownRef.current) {
      await showDropProxyForCurrentBounds();
    }
  };

  return (
    <div
      ref={rootRef}
      className="h-full flex flex-col bg-qc-surface relative"
      onDragEnter={handleChatDragEnter}
      onDragOver={handleChatDragOver}
    >
      {isDragHighlightVisible && (
        <div className="absolute inset-0 bg-blue-500/10 pointer-events-none flex items-center justify-center z-20 ring-2 ring-blue-500 ring-inset">
          <div className="bg-qc-panel rounded-xl shadow-lg px-6 py-4 flex items-center gap-3">
            <i className="ti ti-upload text-2xl text-blue-500"></i>
            <span className="text-qc-fg">{t('chat.drag.dropToAddFile')}</span>
          </div>
        </div>
      )}
      {selectionCopy.visible && (
        <button
          type="button"
          data-no-drag
          onClick={copySelectionText}
          className="absolute z-30 w-6 h-6 rounded-md border border-qc-border bg-qc-panel text-qc-fg hover:bg-qc-hover shadow-md flex items-center justify-center"
          style={{ left: `${selectionCopy.x}px`, top: `${selectionCopy.y}px` }}
          title={t('common.copy')}
        >
          <i className="ti ti-copy text-[12px]" />
        </button>
      )}
      <div className="flex-1 min-h-0 overflow-hidden custom-scrollbar-container">
        <div
          ref={(el) => {
            messageListRef.current = el;
            if (el) {
              setMessageScrollerElement(el);
            }
          }}
          className="h-full overflow-y-auto p-3 space-y-3 select-text"
          data-no-drag
        >
        {messages.map((message) => {
          const isOut = message.direction === 'out';
          const now = Date.now();
          const showExpired =
            (message.status === 'pending' || message.status === 'waiting_accept') &&
            typeof message.expire_at_ms === 'number' &&
            now > message.expire_at_ms;
          const status = showExpired ? t('chat.status.expired') : statusText(message, now, t);
          return (
            <div key={`${message.id}-${message.sent_at_ms}`} className={`flex min-w-0 ${isOut ? 'justify-end' : 'justify-start'}`} data-no-drag>
              <div className={`min-w-0 max-w-[80%] rounded-lg px-3 py-2 select-text ${isOut ? 'bg-blue-500 text-white' : 'bg-qc-panel border border-qc-border text-qc-fg'}`} data-no-drag>
                {message.message_type === 'text' && (
                  <div className="text-sm whitespace-pre-wrap break-words select-text">{message.text}</div>
                )}
                {message.message_type === 'file' && (
                  <div className="min-w-0 space-y-2">
                    {message.text ? <div className="text-sm whitespace-pre-wrap break-words select-text">{message.text}</div> : null}
                    <div className="min-w-0 space-y-1">
                      {buildDisplayEntries(message.files || []).map((entry) => (
                        <div
                          key={entry.key}
                          className={`min-w-0 text-xs rounded px-2 py-1 whitespace-normal break-all select-text ${isOut ? 'bg-white/20' : 'bg-qc-hover'}`}
                        >
                          {entry.kind === 'folder'
                            ? `${entry.folderName} (${t('chat.fileCard.itemsCount', { count: entry.fileCount })}) · ${formatFileSize(entry.totalSize)}`
                            : `${entry.fileName} · ${formatFileSize(entry.fileSize)}`}
                        </div>
                      ))}
                    </div>
                    {(status || (!isOut && message.status === 'done')) && (
                      <div className={`flex items-center gap-2 text-xs ${isOut ? 'text-white/85' : 'text-qc-fg-muted'}`}>
                        {status ? <span>{status}</span> : null}
                        {!isOut && message.status === 'done' && (
                          <button
                            className="text-blue-500 hover:text-blue-600 hover:underline"
                            onClick={() => revealFile(message)}
                          >
                            {t('chat.action.viewFile')}
                          </button>
                        )}
                      </div>
                    )}
                    {message.status === 'transferring' && (
                      <div className={`w-full h-1.5 rounded overflow-hidden ${isOut ? 'bg-white/30' : 'bg-qc-hover'}`}>
                        <div className={`h-full ${isOut ? 'bg-white' : 'bg-blue-500'}`} style={{ width: `${message.progress || 0}%` }} />
                      </div>
                    )}
                    {!isOut && (message.status === 'pending') && !showExpired && (
                      <div className="flex items-center gap-2">
                        <button
                          className="h-7 px-3 rounded bg-blue-500 text-white text-xs hover:bg-blue-600"
                          onClick={() => acceptOffer(message)}
                        >
                          {t('chat.action.accept')}
                        </button>
                        <button
                          className="h-7 px-3 rounded border border-qc-border text-qc-fg text-xs hover:bg-qc-hover"
                          onClick={() => rejectOffer(message)}
                        >
                          {t('chat.action.reject')}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        </div>
      </div>

      <div
        className="chat-composer-bar border-t border-qc-border bg-qc-panel/70 backdrop-blur-md transition-colors duration-500"
        style={{ height: `${composerHeight}px` }}
        data-no-drag
      >
        {/* 拖拽手柄 */}
        <Tooltip content={t('chat.tooltip.resizeComposer')} placement="top" asChild>
          <div
            data-no-drag
            className="h-1 cursor-row-resize hover:bg-blue-400/40 transition-colors"
            onMouseDown={startResizeComposer}
          />
        </Tooltip>

        <div className="flex h-[calc(100%-4px)] px-3 pt-2 pb-1 gap-0 overflow-hidden" data-no-drag>
          <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-0" data-no-drag>
            {/* 文件预览 */}
            {hasPendingFiles && (
              <div className="flex-shrink-0 overflow-x-auto overflow-y-hidden rounded-tl-md rounded-tr-none rounded-b-none border border-qc-border bg-qc-panel">
                <div className="inline-flex items-center gap-2 min-w-full w-max px-2 py-1">
                  {buildDisplayEntries(pendingFiles).map((entry) => (
                    <Tooltip
                      key={entry.key}
                      content={
                        entry.kind === 'folder'
                          ? `${entry.folderName} (${t('chat.fileCard.itemsCount', { count: entry.fileCount })}, ${formatFileSize(entry.totalSize)})`
                          : `${entry.fileName} (${formatFileSize(entry.fileSize)})`
                      }
                      placement="top"
                      asChild
                    >
                      <div
                        className="relative shrink-0 w-32 rounded-md border border-qc-border bg-qc-panel px-2 py-1"
                      >
                        <button
                          data-no-drag
                          className="absolute top-0.5 right-0.5 text-qc-fg-muted hover:text-red-500"
                          onClick={() => removePendingEntry(entry)}
                        >
                          <i className="ti ti-x text-[11px]" />
                        </button>
                        <div className="text-[11px] leading-3 pr-3 truncate">
                          {entry.kind === 'folder' ? entry.folderName : entry.fileName}
                        </div>
                        <div className="text-[10px] leading-3 text-qc-fg-muted truncate">
                          {entry.kind === 'folder'
                            ? `${t('chat.fileCard.itemsCount', { count: entry.fileCount })} · ${formatFileSize(entry.totalSize)}`
                            : formatFileSize(entry.fileSize)}
                        </div>
                      </div>
                    </Tooltip>
                  ))}
                </div>
              </div>
            )}

            {/* 输入框 */}
            <div className="flex-1 min-h-0 relative z-10" data-no-drag>
              <textarea
                ref={inputRef}
                data-no-drag
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value);
                }}
                onClick={handleTextareaClick}
                onKeyDown={handleTextareaKeyDown}
                placeholder={currentDeviceId ? t('chat.placeholder.input') : t('chat.placeholder.selectDeviceFirst')}
                className={`w-full h-full min-h-0 resize-none border border-qc-border bg-qc-panel text-sm text-qc-fg p-3 leading-5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${
                  hasPendingFiles ? 'rounded-bl-md rounded-tl-none rounded-r-none border-t-0' : 'rounded-l-md rounded-r-none'
                }`}
              />
            </div>
          </div>

          {/* 右侧竖排按钮*/}
          <div className="flex flex-col gap-0 w-10 shrink-0 min-h-0 relative z-0" data-no-drag>
            <Tooltip content={t('chat.action.addFile')} placement="left" asChild>
              <button
                data-no-drag
                className="flex-1 min-h-0 flex items-center justify-center rounded-tr-md rounded-tl-none rounded-b-none border border-qc-border bg-qc-panel text-qc-fg hover:bg-qc-hover transition-colors"
                onClick={chooseFiles}
              >
                <i className="ti ti-paperclip text-xl" />
              </button>
            </Tooltip>
            <Tooltip content={t('chat.action.send')} placement="left" asChild>
              <button
                data-no-drag
                onClick={sendMessage}
                disabled={!currentDeviceId}
                className="flex-1 min-h-0 flex items-center justify-center rounded-br-md rounded-bl-none rounded-t-none border border-qc-border border-t-0 bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
              >
                <i className="ti ti-send text-xl" />
              </button>
            </Tooltip>
            <Tooltip content={t('chat.sendHotkey.tooltip')} placement="left" asChild>
              <button
                data-no-drag
                type="button"
                onClick={openSendHotkeyMenu}
                className="h-5 flex items-center justify-center rounded-br-md rounded-bl-none rounded-t-none border border-qc-border border-t-0 bg-qc-panel text-qc-fg-muted hover:bg-qc-hover transition-colors"
              >
                <i className="ti ti-chevron-down text-[12px]" />
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ChatTab;
