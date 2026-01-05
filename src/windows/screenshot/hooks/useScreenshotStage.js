import { useState, useMemo } from 'react';
import { getLastScreenshotCaptures } from '@shared/api/system';
import { createStageRegionManager } from '../utils/stageRegionManager';

const workerUrl = new URL('../workers/bmpDecodeWorker.js', import.meta.url);

const DEFAULT_STAGE_SIZE = { width: 1, height: 1 };

const maxWorkers = typeof navigator !== 'undefined' && navigator.hardwareConcurrency
  ? Math.max(1, Math.min(4, navigator.hardwareConcurrency))
  : 2;

function createWorkerPool() {
  const workers = [];
  const queue = [];
  let reqId = 0;

  function processQueue() {
    if (!queue.length) return;
    for (const entry of workers) {
      if (!queue.length || entry.busy) continue;
      const task = queue.shift();
      entry.busy = true;
      entry.task = task;
      entry.worker.postMessage({ id: task.id, rawUrl: task.rawUrl, width: task.width, height: task.height });
    }
  }

  for (let i = 0; i < maxWorkers; i++) {
    const worker = new Worker(workerUrl, { type: 'module' });
    const entry = { worker, busy: false, task: null };
    worker.onmessage = (e) => {
      const { success, bitmap, error } = e.data || {};
      const task = entry.task;
      entry.task = null;
      entry.busy = false;
      if (task) success ? task.resolve(bitmap) : task.reject(new Error(error || 'decode failed'));
      processQueue();
    };
    worker.onerror = (e) => {
      const task = entry.task;
      entry.task = null;
      entry.busy = false;
      if (task) task.reject(new Error(e?.message || 'worker error'));
      processQueue();
    };
    workers.push(entry);
  }

  return {
    decode: (rawUrl, width, height) => new Promise((resolve, reject) => {
      queue.push({ id: reqId++, rawUrl, width, height, resolve, reject });
      processQueue();
    }),
    terminate: () => workers.forEach(e => e.worker.terminate()),
  };
}

export default function useScreenshotStage() {
  const [screens, setScreens] = useState([]);
  const [stageSize, setStageSize] = useState(DEFAULT_STAGE_SIZE);
  const stageRegionManager = useMemo(() => createStageRegionManager(screens), [screens]);

  async function reloadFromLastCapture() {
    const maxRetries = 100, retryDelay = 50;
    let infos = null;
    for (let i = 0; i < maxRetries; i++) {
      try {
        infos = await getLastScreenshotCaptures();
        if (infos?.length) break;
      } catch {}
      await new Promise(r => setTimeout(r, retryDelay));
    }
    if (!infos?.length) return;

    const dpr = window.devicePixelRatio || 1;
    const physicalMinX = Math.min(...infos.map(m => m.physical_x));
    const physicalMinY = Math.min(...infos.map(m => m.physical_y));
    const physicalMaxX = Math.max(...infos.map(m => m.physical_x + m.physical_width));
    const physicalMaxY = Math.max(...infos.map(m => m.physical_y + m.physical_height));
    const physicalOffsetX = isFinite(physicalMinX) ? physicalMinX : 0;
    const physicalOffsetY = isFinite(physicalMinY) ? physicalMinY : 0;

    const newStageSize = {
      width: (physicalMaxX - physicalOffsetX) / dpr,
      height: (physicalMaxY - physicalOffsetY) / dpr,
    };
    setStageSize(newStageSize);

    const pool = createWorkerPool();
    try {
      const loadedScreens = await Promise.all(infos.map(async (m) => {
        const image = await pool.decode(m.raw_path, m.physical_width, m.physical_height);
        return {
          image,
          x: (m.physical_x - physicalOffsetX) / dpr,
          y: (m.physical_y - physicalOffsetY) / dpr,
          width: m.physical_width / dpr,
          height: m.physical_height / dpr,
          physicalX: m.physical_x,
          physicalY: m.physical_y,
          physicalWidth: m.physical_width,
          physicalHeight: m.physical_height,
          physicalOffsetX,
          physicalOffsetY,
          scaleFactor: m.scale_factor,
        };
      }));
      setScreens(loadedScreens);
    } finally {
      pool.terminate();
    }
  }

  return { screens, stageSize, stageRegionManager, reloadFromLastCapture };
}
