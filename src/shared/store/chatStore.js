import { proxy } from 'valtio';
import { listen } from '@tauri-apps/api/event';
import { listLanChatConnectedDevices } from '@shared/api/chat';

function nowMs() {
  return Date.now();
}

function ensureSession(state, deviceId) {
  if (!deviceId) return null;
  if (!state.sessions[deviceId]) {
    state.sessions[deviceId] = {
      deviceId,
      messages: []
    };
  }
  return state.sessions[deviceId];
}

function pushMessage(state, peerDeviceId, message) {
  const session = ensureSession(state, peerDeviceId);
  if (!session) return;
  session.messages.push(message);
}

function updateFileMessageStatus(state, peerDeviceId, transferId, patch) {
  const session = state.sessions[peerDeviceId];
  if (!session) return;
  const target = session.messages.find(
    (m) => m.message_type === 'file' && m.transfer_id === transferId
  );
  if (!target) return;
  Object.assign(target, patch);
}

function updateFileMessageStatusByTransfer(state, transferId, patch) {
  Object.values(state.sessions).forEach((session) => {
    const target = session.messages.find(
      (m) => m.message_type === 'file' && m.transfer_id === transferId
    );
    if (!target) return;
    Object.assign(target, patch);
  });
}

function buildReceivedPathsFromFiles(files) {
  if (!Array.isArray(files)) return [];
  return files
    .map((file) => file?.path)
    .filter((path) => typeof path === 'string' && path.trim());
}

export const chatStore = proxy({
  currentDeviceId: '',
  connectedDevices: [],
  sessions: {},
  unreadByDevice: {},
  isChatActive: false,
  inited: false,
  unlisten: null,

  markDeviceRead(deviceId) {
    if (!deviceId) return;
    if (!this.unreadByDevice[deviceId]) return;
    this.unreadByDevice[deviceId] = 0;
  },

  setChatActive(active) {
    this.isChatActive = !!active;
    if (this.isChatActive && this.currentDeviceId) {
      this.markDeviceRead(this.currentDeviceId);
    }
  },

  shouldCountUnread(deviceId) {
    if (!deviceId) return false;
    return !(this.isChatActive && this.currentDeviceId === deviceId);
  },

  incrementUnread(deviceId) {
    if (!deviceId) return;
    this.unreadByDevice[deviceId] = (this.unreadByDevice[deviceId] || 0) + 1;
  },

  async refreshDevices() {
    try {
      const list = await listLanChatConnectedDevices();
      const nextDevices = Array.isArray(list) ? list : [];
      this.connectedDevices = nextDevices;

      const hasCurrentDevice = nextDevices.some((item) => item?.device_id === this.currentDeviceId);
      if (hasCurrentDevice) {
        return;
      }

      const nextCurrentDeviceId = nextDevices[0]?.device_id || '';
      this.currentDeviceId = nextCurrentDeviceId;
      if (nextCurrentDeviceId) {
        ensureSession(this, nextCurrentDeviceId);
        if (this.isChatActive) {
          this.markDeviceRead(nextCurrentDeviceId);
        }
      }
    } catch (_e) {
    }
  },

  selectDevice(deviceId) {
    this.currentDeviceId = deviceId;
    ensureSession(this, deviceId);
    if (this.isChatActive) {
      this.markDeviceRead(deviceId);
    }
  },

  addLocalText(message) {
    const peer = message.to_device_id;
    pushMessage(this, peer, {
      id: message.message_id,
      message_type: 'text',
      direction: 'out',
      text: message.text,
      sent_at_ms: message.sent_at_ms
    });
  },

  handleIncomingText(message) {
    const peer = message.from_device_id;
    pushMessage(this, peer, {
      id: message.message_id,
      message_type: 'text',
      direction: 'in',
      text: message.text,
      sent_at_ms: message.sent_at_ms
    });
    if (this.shouldCountUnread(peer)) {
      this.incrementUnread(peer);
    }
  },

  addLocalFileOffer(offer) {
    pushMessage(this, offer.to_device_id, {
      id: offer.transfer_id,
      message_type: 'file',
      transfer_id: offer.transfer_id,
      direction: 'out',
      from_device_id: offer.from_device_id,
      to_device_id: offer.to_device_id,
      text: offer.text || '',
      files: offer.files || [],
      status: 'waiting_accept',
      sent_at_ms: offer.sent_at_ms,
      expire_at_ms: offer.expire_at_ms,
      progress: 0
    });
  },

  handleIncomingFileOffer(offer) {
    const peer = offer.from_device_id;
    pushMessage(this, offer.from_device_id, {
      id: offer.transfer_id,
      message_type: 'file',
      transfer_id: offer.transfer_id,
      direction: 'in',
      from_device_id: offer.from_device_id,
      to_device_id: offer.to_device_id,
      text: offer.text || '',
      files: offer.files || [],
      status: nowMs() > offer.expire_at_ms ? 'expired' : 'pending',
      sent_at_ms: offer.sent_at_ms,
      expire_at_ms: offer.expire_at_ms,
      progress: 0
    });
    if (this.shouldCountUnread(peer)) {
      this.incrementUnread(peer);
    }
  },

  handleFileAccept(decision) {
    updateFileMessageStatus(this, decision.from_device_id, decision.transfer_id, {
      status: 'transferring'
    });
  },

  handleFileReject(decision) {
    updateFileMessageStatus(this, decision.from_device_id, decision.transfer_id, {
      status: 'rejected'
    });
  },

  handleFileExpired(decision) {
    updateFileMessageStatus(this, decision.from_device_id, decision.transfer_id, {
      status: 'expired'
    });
  },

  handleFileProgress(payload) {
    const transferId = payload.transfer_id;
    const total = payload.total_size || 0;
    const progressed = payload.received_size || payload.sent_size || 0;
    const progress = total > 0 ? Math.min(100, Math.floor(progressed * 100 / total)) : 0;
    Object.values(this.sessions).forEach((session) => {
      const msg = session.messages.find((m) => m.message_type === 'file' && m.transfer_id === transferId);
      if (msg) {
        if (['done', 'rejected', 'expired', 'canceled_by_sender', 'canceled_by_receiver'].includes(msg.status)) {
          return;
        }
        msg.status = 'transferring';
        msg.progress = progress;
      }
    });
  },

  handleFileState(payload) {
    const transferId = payload?.transfer_id;
    if (!transferId) return;
    const files = Array.isArray(payload?.files) ? payload.files : [];
    const patch = {
      status: payload?.status || 'failed',
      files,
      error: payload?.error || '',
      progress: 0
    };

    const totalSize = files.reduce((sum, file) => sum + Number(file?.file_size || 0), 0);
    const receivedSize = files.reduce((sum, file) => sum + Number(file?.received_size || 0), 0);
    if (totalSize > 0) {
      patch.progress = Math.min(100, Math.floor(receivedSize * 100 / totalSize));
    }
    if (patch.status === 'done' || patch.status === 'partial') {
      const receivedPaths = buildReceivedPathsFromFiles(files);
      if (receivedPaths.length > 0) {
        patch.received_paths = receivedPaths;
      }
      if (patch.status === 'done') {
        patch.progress = 100;
      }
    }

    updateFileMessageStatusByTransfer(this, transferId, patch);
  },

  handleFileDone(payload) {
    const done = payload.done;
    if (!done) return;
    const patch = {
      status: 'done',
      progress: 100
    };
    if (Array.isArray(payload.paths) && payload.paths.length > 0) {
      patch.received_paths = payload.paths.filter(Boolean);
    }
    updateFileMessageStatusByTransfer(this, done.transfer_id, patch);
  },

  handleFileFailed(payload) {
    const done = payload?.done;
    if (!done?.transfer_id) return;
    updateFileMessageStatusByTransfer(this, done.transfer_id, {
      status: 'failed',
      error: payload?.error || ''
    });
  },

  markTransferStatus(transferId, status) {
    updateFileMessageStatusByTransfer(this, transferId, { status });
  },

  async init() {
    if (this.inited) return;
    this.inited = true;
    await this.refreshDevices();

    const unlisten = await listen('lan-chat-event', (event) => {
      const payload = event?.payload || {};
      const type = payload.type;
      if (type === 'chat_text' && payload.message) {
        this.handleIncomingText(payload.message);
      } else if (type === 'file_offer' && payload.offer) {
        this.handleIncomingFileOffer(payload.offer);
      } else if (type === 'file_state') {
        this.handleFileState(payload);
      } else if (type === 'file_accept' && payload.decision) {
        this.handleFileAccept(payload.decision);
      } else if (type === 'file_reject' && payload.decision) {
        this.handleFileReject(payload.decision);
      } else if (type === 'file_expired' && payload.decision) {
        this.handleFileExpired(payload.decision);
      } else if (type === 'file_progress') {
        this.handleFileProgress(payload);
      } else if (type === 'file_done') {
        this.handleFileDone(payload);
      } else if (type === 'file_failed') {
        this.handleFileFailed(payload);
      } else if (type === 'file_service_probe' || type === 'file_service_probe_result' || type === 'file_service_retry') {
        console.log('[LAN文件调试]', payload);
      }
    });
    this.unlisten = unlisten;
  }
});
