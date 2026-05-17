import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { useSnapshot } from 'valtio';
import { defaultSettings } from '@shared/services/settingsService';
import { settingsStore, initSettings } from '@shared/store/settingsStore';
import { useTheme, applyThemeToBody } from '@shared/hooks/useTheme';
import { useSettingsSync } from '@shared/hooks/useSettingsSync';
import {
  applyBackgroundImage,
  clearBackgroundImage,
} from '@shared/utils/backgroundManager';
import {
  getClipboardItemById,
  getFavoriteItemById,
  getClipboardItemPasteOptions,
} from '@shared/api';
import { getFavoriteItemPasteOptions } from '@shared/api/favorites';
import {
  extractFormatKinds,
  formatKindsToLabels,
  resolvePreviewModes as resolveFormatPreviewModes,
} from '@shared/utils/pasteFormatHints';
import { normalizeDisplayPriorityOrder } from '@shared/utils/displayFormatPriority';
import {
  ImagePreview,
  FilePreview,
  HtmlPreview,
  PreviewHint,
  TextPreview,
} from './views';
import {
  MODE_TEXT,
  MODE_HTML,
  MODE_IMAGE,
  MODE_FILE,
  TEXT_SCROLL_STEP,
  IMAGE_SCALE_STEP,
  IMAGE_SCALE_MIN,
  IMAGE_SCALE_MAX,
  IMAGE_SCALE_INDICATOR_DURATION,
  IMAGE_STATUS_IDLE,
  IMAGE_STATUS_LOADING,
  IMAGE_STATUS_READY,
  IMAGE_STATUS_ERROR,
  clamp,
  isFiniteNumber,
  resolveBoxSize,
  chooseContainerPosition,
  estimateTextHeight,
  resolvePreviewMode,
  parsePreviewFiles,
  buildPreviewFileStats,
  parseImageFilePath,
  parseRawImagePath,
  parseFirstImageId,
  parseImageDimensionsFromItem,
} from './utils';

async function loadItemData(source, itemId) {
  if (source === 'clipboard') {
    const numericId = Number(itemId);
    if (!Number.isFinite(numericId)) {
      throw new Error('剪贴板项目 ID 无效');
    }
    return await getClipboardItemById(numericId);
  }

  if (source === 'favorite') {
    return await getFavoriteItemById(String(itemId));
  }

  throw new Error('未知预览来源');
}

async function loadPasteOptions(source, itemId) {
  if (source === 'clipboard') {
    const numericId = Number(itemId);
    if (!Number.isFinite(numericId)) {
      return [];
    }
    return await getClipboardItemPasteOptions(numericId);
  }

  if (source === 'favorite') {
    return await getFavoriteItemPasteOptions(String(itemId));
  }

  return [];
}

async function resolveImageUrlFromItem(item) {
  const content = typeof item?.content === 'string' ? item.content.trim() : '';
  if (content.startsWith('data:image/')) {
    return content;
  }

  const parsedPath = parseImageFilePath(content);
  if (parsedPath) {
    const resolvedPath = parsedPath.includes(':') || parsedPath.startsWith('\\\\')
      ? parsedPath
      : await invoke('resolve_image_path', { storedPath: parsedPath });
    return convertFileSrc(resolvedPath, 'asset');
  }

  const rawPath = parseRawImagePath(content);
  if (rawPath) {
    const mayBeFilePath = rawPath.includes(':') || rawPath.startsWith('\\\\') || rawPath.includes('/') || rawPath.includes('\\');
    if (mayBeFilePath) {
      const resolvedPath = rawPath.includes(':') || rawPath.startsWith('\\\\')
        ? rawPath
        : await invoke('resolve_image_path', { storedPath: rawPath });
      return convertFileSrc(resolvedPath, 'asset');
    }
  }

  const imageId = parseFirstImageId(item?.image_id);
  if (imageId) {
    const dataDir = await invoke('get_data_directory');
    const normalizedDataDir = String(dataDir).replace(/\\/g, '/');
    const filePath = `${normalizedDataDir}/clipboard_images/${imageId}.png`;
    return convertFileSrc(filePath, 'asset');
  }

  return '';
}

function orderPreviewModesByDisplayPriority(modes, displayPriorityOrder) {
  if (!Array.isArray(modes) || modes.length <= 1) {
    return Array.isArray(modes) ? modes : [];
  }

  const orderedFormats = normalizeDisplayPriorityOrder(displayPriorityOrder);
  const modeOrderMap = {
    text: MODE_TEXT,
    html: MODE_HTML,
    image: MODE_IMAGE,
    file: MODE_FILE,
  };
  const orderedModes = orderedFormats
    .map((format) => modeOrderMap[format])
    .filter((mode) => typeof mode === 'string' && mode.length > 0);

  const weight = new Map(orderedModes.map((mode, index) => [mode, index]));
  const fallbackWeight = orderedModes.length + 10;
  return [...modes].sort((a, b) => {
    const wa = weight.has(a) ? weight.get(a) : fallbackWeight;
    const wb = weight.has(b) ? weight.get(b) : fallbackWeight;
    return wa - wb;
  });
}

function App() {
  const { t } = useTranslation();
  const [previewData, setPreviewData] = useState(null);
  const [previewMode, setPreviewMode] = useState(MODE_TEXT);
  const [previewItem, setPreviewItem] = useState(null);
  const [formatKinds, setFormatKinds] = useState([]);
  const [textContent, setTextContent] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [htmlPreferredSize, setHtmlPreferredSize] = useState(null);
  const [textPreferredHeight, setTextPreferredHeight] = useState(null);
  const [imageUrl, setImageUrl] = useState('');
  const [imageLoadState, setImageLoadState] = useState(IMAGE_STATUS_IDLE);
  const [imageDimensions, setImageDimensions] = useState(null);
  const [imageScale, setImageScale] = useState(1);
  const [showImageScaleIndicator, setShowImageScaleIndicator] = useState(false);
  const [hasMousePosition, setHasMousePosition] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [mousePositionPhysical, setMousePositionPhysical] = useState({ x: 0, y: 0 });
  const revealedRequestIdRef = useRef(0);
  const textPreviewRef = useRef(null);
  const htmlPreviewRef = useRef(null);
  const filePreviewRef = useRef(null);
  const imageScaleIndicatorTimerRef = useRef(null);
  const settings = useSnapshot(settingsStore);
  const { theme, darkThemeStyle, backgroundImagePath } = settings;
  const { effectiveTheme, isDark, isBackground } = useTheme();
  useSettingsSync();

  const resetPreviewState = () => {
    revealedRequestIdRef.current = 0;
    setPreviewData(null);
    setPreviewItem(null);
    setFormatKinds([]);
    setPreviewMode(MODE_TEXT);
    setTextContent('');
    setHtmlContent('');
    setHtmlPreferredSize(null);
    setTextPreferredHeight(null);
    setImageUrl('');
    setImageLoadState(IMAGE_STATUS_IDLE);
    setImageDimensions(null);
    setImageScale(1);
    setShowImageScaleIndicator(false);
    setHasMousePosition(false);
    setIsVisible(false);
  };

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const oldHtmlOverflow = html.style.overflow;
    const oldBodyOverflow = body.style.overflow;
    const oldBodyMargin = body.style.margin;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.margin = '0';
    return () => {
      html.style.overflow = oldHtmlOverflow;
      body.style.overflow = oldBodyOverflow;
      body.style.margin = oldBodyMargin;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    initSettings().catch(() => { });
    invoke('get_preview_window_data')
      .then((data) => {
        if (!mounted) return;
        setPreviewData(data);
        revealedRequestIdRef.current = 0;
        const cursorX = Number(data?.cursor_x);
        const cursorY = Number(data?.cursor_y);
        if (isFiniteNumber(cursorX) && isFiniteNumber(cursorY)) {
          setMousePositionPhysical({ x: cursorX, y: cursorY });
          setHasMousePosition(true);
        }
      })
      .catch((error) => {
        console.error('获取预览窗口数据失败:', error);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const applyPreviewData = (data) => {
      setPreviewData(data);
      revealedRequestIdRef.current = 0;
      const cursorX = Number(data?.cursor_x);
      const cursorY = Number(data?.cursor_y);
      if (isFiniteNumber(cursorX) && isFiniteNumber(cursorY)) {
        setMousePositionPhysical({ x: cursorX, y: cursorY });
        setHasMousePosition(true);
      }
    };

    const unlistenPromise = listen('preview-window-data-updated', (event) => {
      applyPreviewData(event.payload);
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten()).catch(() => { });
    };
  }, []);

  useEffect(() => {
    const unlistenPromise = listen('preview-window-will-hide', (event) => {
      const requestId = Number(event.payload);
      if (!Number.isFinite(requestId) || requestId <= 0) {
        return;
      }
      if (previewData?.request_id && Number(previewData.request_id) !== requestId) {
        return;
      }

      flushSync(() => {
        resetPreviewState();
      });

      requestAnimationFrame(() => {
        invoke('finalize_hide_preview_window', { requestId }).catch((error) => {
          console.error('完成预览窗口隐藏失败:', error);
        });
      });
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten()).catch(() => { });
    };
  }, [previewData]);

  useEffect(() => {
    applyThemeToBody(theme || defaultSettings.theme, 'preview');
  }, [theme, darkThemeStyle, effectiveTheme]);

  useEffect(() => {
    if (isBackground && backgroundImagePath) {
      applyBackgroundImage({
        containerSelector: '.preview-theme-anchor',
        backgroundImagePath,
        windowName: 'preview',
      });
    } else {
      clearBackgroundImage('.preview-theme-anchor');
    }
    return () => {
      clearBackgroundImage('.preview-theme-anchor');
    };
  }, [isBackground, backgroundImagePath]);

  useEffect(() => {
    if (!previewData) return;
    let cancelled = false;

    setPreviewItem(null);
    setFormatKinds([]);
    setPreviewMode(
      previewData.mode === MODE_IMAGE
        ? MODE_IMAGE
        : previewData.mode === MODE_FILE
          ? MODE_FILE
        : previewData.mode === MODE_HTML
          ? MODE_HTML
          : MODE_TEXT,
    );
    setTextContent('');
    setHtmlContent('');
    setHtmlPreferredSize(null);
    setTextPreferredHeight(null);
    setImageUrl('');
    setImageLoadState(IMAGE_STATUS_IDLE);
    setImageDimensions(null);
    setImageScale(1);
    setShowImageScaleIndicator(false);

    const run = async () => {
      try {
        const [item, pasteOptions] = await Promise.all([
          loadItemData(previewData.source, previewData.item_id),
          loadPasteOptions(previewData.source, previewData.item_id).catch(() => []),
        ]);
        if (cancelled) return;

        const nextFormatKinds = extractFormatKinds(pasteOptions, item);
        const supportedPreviewModes = orderPreviewModesByDisplayPriority(
          resolveFormatPreviewModes(item, nextFormatKinds),
          settings.displayPriorityOrder,
        );
        const requestedMode = resolvePreviewMode(previewData.mode, item);
        const initialMode = supportedPreviewModes.includes(requestedMode)
          ? requestedMode
          : (supportedPreviewModes[0] || MODE_TEXT);

        setPreviewItem(item);
        setFormatKinds(nextFormatKinds);
        setPreviewMode(initialMode);
        setTextContent(item?.content || '');
        setTextPreferredHeight(estimateTextHeight(item?.content || ''));
        setHtmlPreferredSize(null);
        setHtmlContent(item?.html_content || '');
      } catch (error) {
        console.error('加载预览内容失败:', error);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [previewData, settings.displayPriorityOrder]);

  const currentRequestId = useMemo(() => {
    const requestId = Number(previewData?.request_id);
    return Number.isFinite(requestId) ? requestId : 0;
  }, [previewData?.request_id]);

  useEffect(() => {
    if (!previewItem || previewMode !== MODE_IMAGE) {
      setImageUrl('');
      setImageLoadState(IMAGE_STATUS_IDLE);
      setImageDimensions(null);
      setImageScale(1);
      return;
    }

    let cancelled = false;
    setImageLoadState(IMAGE_STATUS_LOADING);
    setImageUrl('');
    setImageDimensions(parseImageDimensionsFromItem(previewItem));
    setImageScale(1);

    resolveImageUrlFromItem(previewItem)
      .then((url) => {
        if (cancelled) return;
        if (!url) {
          console.warn('图片预览未解析到可用地址:', {
            source: previewData?.source,
            itemId: previewData?.item_id,
            contentType: previewItem?.content_type,
            imageId: previewItem?.image_id,
          });
          setImageLoadState(IMAGE_STATUS_ERROR);
          setImageDimensions(null);
          return;
        }
        setImageUrl(url);
        setImageLoadState(IMAGE_STATUS_LOADING);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('加载图片预览失败:', error);
        setImageLoadState(IMAGE_STATUS_ERROR);
      });

    return () => {
      cancelled = true;
    };
  }, [previewItem, previewMode, previewData]);

  const previewReady = useMemo(() => {
    if (!previewData || !previewItem) {
      return false;
    }

    if (previewMode === MODE_IMAGE) {
      return imageLoadState === IMAGE_STATUS_READY || imageLoadState === IMAGE_STATUS_ERROR;
    }

    return true;
  }, [previewData, previewItem, previewMode, imageLoadState]);

  useEffect(() => {
    if (!previewReady || currentRequestId <= 0) {
      return;
    }
    if (revealedRequestIdRef.current === currentRequestId) {
      return;
    }

    let cancelled = false;
    const rafId = requestAnimationFrame(() => {
      if (cancelled) {
        return;
      }
      invoke('reveal_preview_window', { requestId: currentRequestId })
        .then(() => {
          if (!cancelled) {
            revealedRequestIdRef.current = currentRequestId;
          }
        })
        .catch((error) => {
          console.error('显示预览窗口失败:', error);
        });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [currentRequestId, previewReady]);

  useEffect(() => {
    return () => {
      if (imageScaleIndicatorTimerRef.current) {
        clearTimeout(imageScaleIndicatorTimerRef.current);
        imageScaleIndicatorTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (previewMode === MODE_IMAGE) {
      return;
    }

    setShowImageScaleIndicator(false);
    if (imageScaleIndicatorTimerRef.current) {
      clearTimeout(imageScaleIndicatorTimerRef.current);
      imageScaleIndicatorTimerRef.current = null;
    }
  }, [previewMode]);

  const showImageScaleIndicatorTemporarily = () => {
    setShowImageScaleIndicator(true);
    if (imageScaleIndicatorTimerRef.current) {
      clearTimeout(imageScaleIndicatorTimerRef.current);
    }
    imageScaleIndicatorTimerRef.current = setTimeout(() => {
      setShowImageScaleIndicator(false);
      imageScaleIndicatorTimerRef.current = null;
    }, IMAGE_SCALE_INDICATOR_DURATION);
  };

  useEffect(() => {
    if (!previewData) return;
    let cancelled = false;
    let inFlight = false;

    const pollMousePosition = () => {
      if (cancelled || inFlight) {
        return;
      }

      inFlight = true;
      invoke('get_mouse_position')
        .then((result) => {
          if (cancelled || !Array.isArray(result)) {
            return;
          }
          const [x, y] = result;
          setHasMousePosition(true);
          setMousePositionPhysical((prev) => {
            if (prev.x === x && prev.y === y) return prev;
            return { x, y };
          });
        })
        .catch(() => { })
        .finally(() => {
          inFlight = false;
        });
    };

    pollMousePosition();
    const timer = setInterval(pollMousePosition, 16);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [previewData]);

  useEffect(() => {
    if (!previewData || !hasMousePosition) {
      setIsVisible(false);
      return;
    }

    let rafId = 0;
    rafId = requestAnimationFrame(() => {
      setIsVisible(true);
    });

    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      setIsVisible(false);
    };
  }, [previewData, hasMousePosition]);

  useEffect(() => {
    if (!previewData) return;

    const unlistenPromise = listen('preview-window-scroll', (event) => {
      const payload = event.payload || {};
      if (
        payload.itemId !== previewData.item_id ||
        payload.source !== previewData.source ||
        payload.mode !== previewData.mode
      ) {
        return;
      }

      const direction = payload.direction === 'up' ? 'up' : 'down';
      if (previewMode === MODE_TEXT) {
        const delta = direction === 'up' ? -TEXT_SCROLL_STEP : TEXT_SCROLL_STEP;
        textPreviewRef.current?.scrollBy(delta);
        return;
      }

      if (previewMode === MODE_HTML) {
        const delta = direction === 'up' ? -TEXT_SCROLL_STEP : TEXT_SCROLL_STEP;
        htmlPreviewRef.current?.scrollBy(delta);
        return;
      }

      if (previewMode === MODE_FILE) {
        const delta = direction === 'up' ? -TEXT_SCROLL_STEP : TEXT_SCROLL_STEP;
        filePreviewRef.current?.scrollBy(delta);
        return;
      }

      if (previewMode === MODE_IMAGE) {
        setImageScale((prev) => {
          const next = direction === 'up' ? prev + IMAGE_SCALE_STEP : prev - IMAGE_SCALE_STEP;
          const clampedScale = clamp(Number(next.toFixed(2)), IMAGE_SCALE_MIN, IMAGE_SCALE_MAX);
          if (clampedScale !== prev) {
            showImageScaleIndicatorTemporarily();
          }
          return clampedScale;
        });
      }
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten()).catch(() => { });
    };
  }, [previewData, previewMode]);

  const supportedPreviewModes = useMemo(
    () => orderPreviewModesByDisplayPriority(
      resolveFormatPreviewModes(previewItem, formatKinds).filter((mode) => (
        mode !== MODE_FILE || settings.filePreview !== false
      )),
      settings.displayPriorityOrder,
    ),
    [previewItem, formatKinds, settings.displayPriorityOrder, settings.filePreview],
  );

  const filePreviewFiles = useMemo(
    () => parsePreviewFiles(previewItem),
    [previewItem],
  );

  const filePreviewStats = useMemo(
    () => buildPreviewFileStats(filePreviewFiles),
    [filePreviewFiles],
  );

  useEffect(() => {
    if (!supportedPreviewModes.length) {
      return;
    }
    if (!supportedPreviewModes.includes(previewMode)) {
      setPreviewMode(supportedPreviewModes[0]);
    }
  }, [supportedPreviewModes, previewMode]);

  useEffect(() => {
    if (!previewData) {
      return;
    }

    const unlistenPromise = listen('preview-window-cycle-format', (event) => {
      const payload = event.payload || {};
      if (
        payload.itemId !== previewData.item_id ||
        payload.source !== previewData.source
      ) {
        return;
      }

      if (supportedPreviewModes.length <= 1) {
        return;
      }

      const direction = payload.direction === 'prev' ? 'prev' : 'next';
      setPreviewMode((currentMode) => {
        const currentIndex = supportedPreviewModes.indexOf(currentMode);
        const safeIndex = currentIndex >= 0 ? currentIndex : 0;
        const nextIndex = direction === 'prev'
          ? (safeIndex - 1 + supportedPreviewModes.length) % supportedPreviewModes.length
          : (safeIndex + 1) % supportedPreviewModes.length;
        const nextMode = supportedPreviewModes[nextIndex];
        return nextMode;
      });
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten()).catch(() => { });
    };
  }, [previewData, supportedPreviewModes]);

  const scaleFactor = useMemo(() => {
    const value = Number(previewData?.scale_factor);
    return isFiniteNumber(value) && value > 0 ? value : 1;
  }, [previewData]);

  const workAreaLogical = useMemo(() => {
    if (!previewData) {
      return { left: 0, top: 0, width: 0, height: 0 };
    }
    return {
      left: previewData.work_area_x / scaleFactor,
      top: previewData.work_area_y / scaleFactor,
      width: previewData.work_area_width / scaleFactor,
      height: previewData.work_area_height / scaleFactor,
    };
  }, [previewData, scaleFactor]);

  const mainWindowLogical = useMemo(() => {
    if (!previewData) {
      return null;
    }

    const left = Number(previewData.main_window_x) / scaleFactor;
    const top = Number(previewData.main_window_y) / scaleFactor;
    const width = Number(previewData.main_window_width) / scaleFactor;
    const height = Number(previewData.main_window_height) / scaleFactor;

    if (![left, top, width, height].every((value) => isFiniteNumber(value)) || width <= 0 || height <= 0) {
      return null;
    }

    return { left, top, width, height };
  }, [previewData, scaleFactor]);

  const boxSize = useMemo(() => {
    return resolveBoxSize(previewMode, workAreaLogical.height, workAreaLogical.width, {
      textHeight: textPreferredHeight,
      imageWidth: imageDimensions?.width,
      imageHeight: imageDimensions?.height,
      htmlWidth: htmlPreferredSize?.width,
      htmlHeight: htmlPreferredSize?.height,
      fileCount: filePreviewStats.fileCount,
      longestFileNameLength: filePreviewStats.longestNameLength,
      longestFilePathLength: filePreviewStats.longestPathLength,
    });
  }, [
    previewMode,
    workAreaLogical.height,
    workAreaLogical.width,
    textPreferredHeight,
    imageDimensions,
    htmlPreferredSize,
    filePreviewStats,
  ]);

  const displaySize = useMemo(() => {
    if (previewMode === MODE_IMAGE) {
      return {
        width: boxSize.width * imageScale,
        height: boxSize.height * imageScale,
      };
    }

    return {
      width: boxSize.width,
      height: boxSize.height,
    };
  }, [previewMode, boxSize, imageScale]);

  const viewportLogical = useMemo(() => {
    const fallbackWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
    const fallbackHeight = typeof window !== 'undefined' ? window.innerHeight : 0;
    return {
      width: workAreaLogical.width > 0 ? workAreaLogical.width : fallbackWidth,
      height: workAreaLogical.height > 0 ? workAreaLogical.height : fallbackHeight,
    };
  }, [workAreaLogical.width, workAreaLogical.height]);

  const mousePositionLogical = useMemo(() => ({
    x: mousePositionPhysical.x / scaleFactor,
    y: mousePositionPhysical.y / scaleFactor,
  }), [mousePositionPhysical, scaleFactor]);

  const containerPosition = useMemo(() => {
    if (!previewData) {
      return { left: -99999, top: -99999 };
    }

    return chooseContainerPosition(
      mousePositionLogical.x,
      mousePositionLogical.y,
      displaySize.width,
      displaySize.height,
      workAreaLogical,
      mainWindowLogical,
    );
  }, [previewData, mousePositionLogical, displaySize, workAreaLogical, mainWindowLogical]);

  const isPreviewOnLeftOfMainWindow = useMemo(() => {
    if (!mainWindowLogical) {
      return false;
    }
    return containerPosition.left + displaySize.width <= mainWindowLogical.left;
  }, [containerPosition.left, displaySize.width, mainWindowLogical]);

  const imageScalePercent = useMemo(() => `${Math.round(imageScale * 100)}%`, [imageScale]);
  const previewModeLabel = useMemo(() => {
    if (previewMode === MODE_IMAGE) {
      return t('previewWindow.formatImage', '图片');
    }
    if (previewMode === MODE_FILE) {
      return t('previewWindow.formatFile', '文件');
    }
    if (previewMode === MODE_HTML) {
      return t('previewWindow.formatHtml', 'HTML');
    }
    return t('previewWindow.formatText', '纯文本');
  }, [previewMode, t]);
  const formatHintLabels = useMemo(() => formatKindsToLabels(formatKinds, t), [formatKinds, t]);
  const formatHintText = useMemo(() => formatHintLabels.join(' / '), [formatHintLabels]);
  const textContainerBackgroundColor = useMemo(() => {
    if (isBackground) {
      return 'color-mix(in srgb, var(--qc-panel) 58%, transparent)';
    }
    return 'color-mix(in srgb, var(--qc-surface) 90%, transparent)';
  }, [isBackground]);
  const textContainerBackgroundImageStyle = useMemo(() => {
    if (!isBackground || !backgroundImagePath) {
      return undefined;
    }

    try {
      const assetUrl = convertFileSrc(backgroundImagePath, 'asset');
      return {
        backgroundImage: `url("${assetUrl}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      };
    } catch {
      return undefined;
    }
  }, [isBackground, backgroundImagePath]);
  const blurredBackgroundLayerStyle = useMemo(() => {
    if (!textContainerBackgroundImageStyle) {
      return undefined;
    }

    return {
      ...textContainerBackgroundImageStyle,
      position: 'absolute',
      inset: '-12px',
      filter: 'blur(var(--theme-superbg-blur-10, 10px))',
      transform: 'scale(1.06)',
      transformOrigin: 'center',
      opacity: 0.92,
      pointerEvents: 'none',
    };
  }, [textContainerBackgroundImageStyle]);
  const previewHintStyle = isBackground
    ? {
      backgroundColor: 'var(--bg-titlebar-bg, rgb(240, 240, 240))',
      color: 'var(--bg-titlebar-text, #333333)',
      border: '2px solid var(--bg-titlebar-border, rgba(232, 233, 234, 0.8))',
      backdropFilter: 'none',
      WebkitBackdropFilter: 'none',
      boxShadow: '0 0 5px 1px rgba(0, 0, 0, 0.3), 0 0 3px 0 rgba(0, 0, 0, 0.2)',
    }
    : {
      backgroundColor: 'var(--qc-surface)',
      border: '2px solid color-mix(in srgb, var(--qc-fg) 30%, transparent)',
      boxShadow: '0 0 5px 1px rgba(0, 0, 0, 0.3), 0 0 3px 0 rgba(0, 0, 0, 0.2)',
    };

  if (!previewData || !hasMousePosition) {
    return (
      <div className="preview-container fixed inset-0 overflow-hidden bg-transparent">
        <div
          className="preview-theme-anchor pointer-events-none absolute opacity-0"
          style={{ width: 0, height: 0, overflow: 'hidden' }}
        />
      </div>
    );
  }

  const relativeLeft = clamp(
    containerPosition.left - workAreaLogical.left,
    0,
    Math.max(0, viewportLogical.width - displaySize.width),
  );
  const relativeTop = clamp(
    containerPosition.top - workAreaLogical.top,
    0,
    Math.max(0, viewportLogical.height - displaySize.height),
  );
  const previewHintTop = Math.max(0, relativeTop - 28);
  const previewHintMaxWidth = Math.max(240, viewportLogical.width - 24);

  const renderPreviewHint = () => {
    const showSwitchHint = supportedPreviewModes.length > 1;

    if (previewMode === MODE_IMAGE) {
      return (
        <div className="flex items-center gap-2">
          <PreviewHint style={previewHintStyle}>
            {t('previewWindow.currentFormatHint', { format: previewModeLabel })}
          </PreviewHint>
          {formatHintText && (
            <PreviewHint style={previewHintStyle}>
              {t('previewWindow.formatsHint', { formats: formatHintText })}
            </PreviewHint>
          )}
          {showSwitchHint && (
            <PreviewHint style={previewHintStyle}>
              {t('previewWindow.switchFormatHint')}
            </PreviewHint>
          )}
          <PreviewHint style={previewHintStyle}>
            {t('previewWindow.imageHint')}
          </PreviewHint>
          {showImageScaleIndicator && (
            <PreviewHint style={previewHintStyle}>
              {imageScalePercent}
            </PreviewHint>
          )}
        </div>
      );
    }

    if (previewMode === MODE_FILE) {
      return (
        <div className="flex items-center gap-2">
          <PreviewHint style={previewHintStyle}>
            {t('previewWindow.currentFormatHint', { format: previewModeLabel })}
          </PreviewHint>
          {formatHintText && (
            <PreviewHint style={previewHintStyle}>
              {t('previewWindow.formatsHint', { formats: formatHintText })}
            </PreviewHint>
          )}
          {showSwitchHint && (
            <PreviewHint style={previewHintStyle}>
              {t('previewWindow.switchFormatHint')}
            </PreviewHint>
          )}
          <PreviewHint style={previewHintStyle}>
            {t('previewWindow.fileHint', 'Ctrl+滚轮，滚动文件列表')}
          </PreviewHint>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2">
        <PreviewHint style={previewHintStyle}>
          {t('previewWindow.currentFormatHint', { format: previewModeLabel })}
        </PreviewHint>
        {formatHintText && (
          <PreviewHint style={previewHintStyle}>
            {t('previewWindow.formatsHint', { formats: formatHintText })}
          </PreviewHint>
        )}
        {showSwitchHint && (
          <PreviewHint style={previewHintStyle}>
            {t('previewWindow.switchFormatHint')}
          </PreviewHint>
        )}
        <PreviewHint style={previewHintStyle}>
          {t('previewWindow.textHint')}
        </PreviewHint>
      </div>
    );
  };

  return (
    <div className={`preview-container fixed inset-0 overflow-hidden bg-transparent ${isDark ? 'dark' : ''}`}>
      <div
        className="preview-theme-anchor pointer-events-none absolute opacity-0"
        style={{ width: 0, height: 0, overflow: 'hidden' }}
      />
      <div
        className="absolute z-20 pointer-events-none"
        style={{
          left: isPreviewOnLeftOfMainWindow ? 'auto' : `${relativeLeft}px`,
          right: isPreviewOnLeftOfMainWindow
            ? `${Math.max(0, viewportLogical.width - relativeLeft - displaySize.width)}px`
            : 'auto',
          top: `${previewHintTop}px`,
          maxWidth: `${previewHintMaxWidth}px`,
          opacity: isVisible ? 1 : 0,
          transition: 'opacity 90ms ease-out',
        }}
      >
        <div className={`flex ${isPreviewOnLeftOfMainWindow ? 'justify-end' : 'justify-start'}`}>
          {renderPreviewHint()}
        </div>
      </div>

      {(previewMode === MODE_TEXT || previewMode === MODE_HTML) && (
        <div
          className="absolute border border-qc-border-strong overflow-hidden"
          style={{
            width: `${boxSize.width}px`,
            height: `${boxSize.height}px`,
            left: `${relativeLeft}px`,
            top: `${relativeTop}px`,
            opacity: isVisible ? 1 : 0,
            transition: 'opacity 90ms ease-out',
            borderRadius: '8px',
            backgroundColor: textContainerBackgroundColor,
            boxShadow: '0 0 5px 1px rgba(0, 0, 0, 0.3), 0 0 3px 0 rgba(0, 0, 0, 0.2)',
          }}
        >
          {blurredBackgroundLayerStyle && <div style={blurredBackgroundLayerStyle} />}
          <div className="relative z-10 w-full h-full overflow-hidden">
            {previewMode === MODE_HTML ? (
              <HtmlPreview
                ref={htmlPreviewRef}
                htmlContent={htmlContent}
                onPreferredSizeChange={setHtmlPreferredSize}
              />
            ) : (
              <TextPreview
                ref={textPreviewRef}
                content={textContent}
                isDark={isDark}
                isBackground={isBackground}
                onPreferredHeightChange={setTextPreferredHeight}
              />
            )}
          </div>
        </div>
      )}

      {previewMode === MODE_FILE && (
        <div
          className="absolute border border-qc-border-strong overflow-hidden"
          style={{
            width: `${boxSize.width}px`,
            height: `${boxSize.height}px`,
            left: `${relativeLeft}px`,
            top: `${relativeTop}px`,
            opacity: isVisible ? 1 : 0,
            transition: 'opacity 90ms ease-out',
            borderRadius: '8px',
            backgroundColor: textContainerBackgroundColor,
            boxShadow: '0 0 5px 1px rgba(0, 0, 0, 0.3), 0 0 3px 0 rgba(0, 0, 0, 0.2)',
          }}
        >
          {blurredBackgroundLayerStyle && <div style={blurredBackgroundLayerStyle} />}
          <div className="relative z-10 w-full h-full overflow-hidden">
            <FilePreview
              ref={filePreviewRef}
              files={filePreviewFiles}
              stats={filePreviewStats}
              t={t}
            />
          </div>
        </div>
      )}

      {previewMode === MODE_IMAGE && (
        <div
          className="absolute overflow-visible pointer-events-none"
          style={{
            width: `${boxSize.width}px`,
            height: `${boxSize.height}px`,
            left: `${relativeLeft}px`,
            top: `${relativeTop}px`,
            transform: `scale(${imageScale})`,
            transformOrigin: 'left top',
            opacity: isVisible ? 1 : 0,
            transition: 'opacity 90ms ease-out',
          }}
        >
          <ImagePreview
            imageUrl={imageUrl}
            imageLoadState={imageLoadState}
            onLoad={(event) => {
              const { naturalWidth, naturalHeight } = event.currentTarget;
              if (naturalWidth > 0 && naturalHeight > 0) {
                setImageDimensions({ width: naturalWidth, height: naturalHeight });
              }
              setImageLoadState(IMAGE_STATUS_READY);
            }}
            onError={() => {
              setImageLoadState(IMAGE_STATUS_ERROR);
            }}
          />
        </div>
      )}
    </div>
  );
}

export default App;
