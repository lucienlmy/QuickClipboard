import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { getLastScreenshotCaptures } from '@shared/api/system';
import { createStageRegionManager } from '../utils/stageRegionManager';

const workerUrl = new URL('../workers/bmpDecodeWorker.js', import.meta.url);

export default function useScreenshotStage() {
  const [screens, setScreens] = useState([]);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });

  const stageRegionManager = useMemo(() => createStageRegionManager(screens), [screens]);
  const maxConcurrentWorkers = useMemo(() => {
    if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
      return Math.max(1, Math.min(4, navigator.hardwareConcurrency));
    }
    return 2;
  }, []);

  const workerPoolRef = useRef([]);
  const requestIdRef = useRef(0);
  const decodeQueueRef = useRef([]);

  const terminateWorkers = useCallback(() => {
    workerPoolRef.current.forEach((entry) => {
      try {
        entry.worker.terminate();
      } catch {
      }
    });
    workerPoolRef.current = [];
    decodeQueueRef.current = [];
  }, []);

  const removeWorkerEntry = (target) => {
    workerPoolRef.current = workerPoolRef.current.filter((entry) => entry !== target);
  };

  const createWorkerEntry = () => {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      throw new Error('Worker 不可用');
    }

    const worker = new Worker(workerUrl, { type: 'module' });
    const entry = {
      worker,
      busy: false,
      task: null,
    };

    worker.onmessage = (event) => {
      const { success, bitmap, error } = event.data || {};
      const currentTask = entry.task;
      entry.task = null;
      entry.busy = false;

      if (currentTask) {
        if (success) {
          currentTask.resolve(bitmap);
        } else {
          currentTask.reject(new Error(error || 'Worker 解码失败'));
        }
      }

      processDecodeQueue();
    };

    worker.onerror = (event) => {
      const currentTask = entry.task;
      entry.task = null;
      entry.busy = false;
      removeWorkerEntry(entry);
      try {
        worker.terminate();
      } catch {}
      if (currentTask) {
        currentTask.reject(new Error(event?.message || 'Worker error'));
      }
      processDecodeQueue();
    };

    workerPoolRef.current.push(entry);
    return entry;
  };

  const ensureWorkerPool = useCallback(() => {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      return false;
    }
    while (workerPoolRef.current.length < maxConcurrentWorkers) {
      try {
        createWorkerEntry();
      } catch (error) {
        console.error('[BMP Worker] 初始化失败:', error);
        break;
      }
    }
    return workerPoolRef.current.length > 0;
  }, [maxConcurrentWorkers]);

  const processDecodeQueue = useCallback(() => {
    if (!decodeQueueRef.current.length) return;

    workerPoolRef.current.forEach((entry) => {
      if (!decodeQueueRef.current.length) return;
      if (entry.busy) return;

      const task = decodeQueueRef.current.shift();
      if (!task) return;

      entry.busy = true;
      entry.task = task;
      try {
        entry.worker.postMessage({ id: task.id, url: task.url });
      } catch (error) {
        entry.busy = false;
        entry.task = null;
        task.reject(error);
        removeWorkerEntry(entry);
      }
    });

    if (decodeQueueRef.current.length && workerPoolRef.current.every((entry) => entry.busy)) {
      return;
    }
  }, []);

  const decodeWithWorker = useCallback((url) => {
    return new Promise((resolve, reject) => {
      if (!ensureWorkerPool()) {
        reject(new Error('Worker 不可用'));
        return;
      }
      const id = requestIdRef.current++;
      decodeQueueRef.current.push({ id, url, resolve, reject });
      processDecodeQueue();
    });
  }, [processDecodeQueue, ensureWorkerPool]);

  const loadImageFallback = useCallback((url) => {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(e);
      img.src = url;
    });
  }, []);

  const loadScreenBitmap = useCallback(async (url) => {
    try {
      return await decodeWithWorker(url);
    } catch (error) {
      console.warn('[Screenshot] Worker解码失败，使用 Image:', error);
      return loadImageFallback(url);
    }
  }, [decodeWithWorker, loadImageFallback]);

  useEffect(() => () => terminateWorkers(), [terminateWorkers]);

  const reloadFromLastCapture = useCallback(async () => {
    try {
      const infos = await getLastScreenshotCaptures();

      if (!infos || !infos.length) {
        return;
      }

      const windowScale = window.devicePixelRatio || 1;

      const meta = infos.map((m, index) => {
        const logicalWidth = m.physical_width / windowScale;
        const logicalHeight = m.physical_height / windowScale;
        const logicalX = m.physical_x / windowScale;
        const logicalY = m.physical_y / windowScale;
        return {
          index,
          filePath: m.file_path,
          logicalX,
          logicalY,
          logicalWidth,
          logicalHeight,
          physicalX: m.physical_x,
          physicalY: m.physical_y,
          physicalWidth: m.physical_width,
          physicalHeight: m.physical_height,
          scaleFactor: m.scale_factor,
        };
      });

      const minX = Math.min(...meta.map((m) => m.logicalX));
      const minY = Math.min(...meta.map((m) => m.logicalY));
      const maxX = Math.max(...meta.map((m) => m.logicalX + m.logicalWidth));
      const maxY = Math.max(...meta.map((m) => m.logicalY + m.logicalHeight));

      const offsetX = isFinite(minX) ? minX : 0;
      const offsetY = isFinite(minY) ? minY : 0;

      const stageWidth = maxX - offsetX;
      const stageHeight = maxY - offsetY;

      setStageSize({ width: stageWidth, height: stageHeight });

      const loadedScreens = await Promise.all(
        meta.map(async (m) => {
          const imageSource = await loadScreenBitmap(m.filePath);
          return {
            image: imageSource,
            x: m.logicalX - offsetX,
            y: m.logicalY - offsetY,
            width: m.logicalWidth,
            height: m.logicalHeight,
            physicalX: m.physicalX,
            physicalY: m.physicalY,
            physicalWidth: m.physicalWidth,
            physicalHeight: m.physicalHeight,
            scaleFactor: m.scaleFactor,
          };
        })
      );

      setScreens(loadedScreens);
    } catch (error) {
      console.error('加载截屏数据失败:', error);
    }
  }, []);

  return { screens, stageSize, stageRegionManager, reloadFromLastCapture };
}
