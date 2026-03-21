import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { useSnapshot } from 'valtio';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { defaultSettings } from '@shared/services/settingsService';
import { settingsStore, initSettings } from '@shared/store/settingsStore';
import { useTheme, applyThemeToBody } from '@shared/hooks/useTheme';
import { useSettingsSync } from '@shared/hooks/useSettingsSync';

const MODE_TEXT = 'text';
const MODE_IMAGE = 'image';
const PREVIEW_OFFSET = 14;
const TEXT_SCROLL_STEP = 120;
const IMAGE_SCALE_STEP = 0.1;
const IMAGE_SCALE_MIN = 1;
const IMAGE_SCALE_MAX = 5;
const IMAGE_SCALE_INDICATOR_DURATION = 1500;
const TEXT_MIN_HEIGHT = 46;
const TEXT_DEFAULT_HEIGHT = 46;
const IMAGE_STATUS_IDLE = 'idle';
const IMAGE_STATUS_LOADING = 'loading';
const IMAGE_STATUS_READY = 'ready';
const IMAGE_STATUS_ERROR = 'error';

const isFiniteNumber = (value) => Number.isFinite(value) && !Number.isNaN(value);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const roundSize = (value, minValue = 120) => Math.max(minValue, Math.round(value));

function resolveBoxSize(mode, workAreaHeight, workAreaWidth, options = {}) {
  if (!isFiniteNumber(workAreaHeight) || workAreaHeight <= 0) {
    return { width: 420, height: 560 };
  }

  if (mode === MODE_IMAGE) {
    const maxEdge = clamp(
      roundSize(workAreaHeight * 0.5, 180),
      180,
      Math.max(180, Math.min(workAreaWidth - 24, workAreaHeight - 24)),
    );
    const imageWidth = Number(options.imageWidth);
    const imageHeight = Number(options.imageHeight);
    if (isFiniteNumber(imageWidth) && imageWidth > 0 && isFiniteNumber(imageHeight) && imageHeight > 0) {
      const scale = Math.min(maxEdge / imageWidth, maxEdge / imageHeight);
      const width = clamp(roundSize(imageWidth * scale, 120), 120, Math.max(120, workAreaWidth - 24));
      const height = clamp(roundSize(imageHeight * scale, 120), 120, Math.max(120, workAreaHeight - 24));
      return { width, height };
    }

    return { width: maxEdge, height: maxEdge };
  }

  const width = roundSize(workAreaHeight * 0.5, 260);
  const maxHeight = clamp(
    roundSize(workAreaHeight * (2 / 3), 300),
    300,
    Math.max(300, workAreaHeight - 24),
  );
  const preferredHeight = Number(options.textHeight);
  const finalWidth = clamp(width, 260, Math.max(260, workAreaWidth - 24));
  const finalHeight = clamp(
    isFiniteNumber(preferredHeight) && preferredHeight > 0 ? Math.round(preferredHeight) : TEXT_DEFAULT_HEIGHT,
    TEXT_MIN_HEIGHT,
    maxHeight,
  );
  return { width: finalWidth, height: finalHeight };
}

function parseImageFilePath(content) {
  if (typeof content !== 'string' || !content.startsWith('files:')) {
    return '';
  }

  try {
    const filesData = JSON.parse(content.slice(6));
    const first = filesData?.files?.[0];
    if (!first) return '';
    return first.actual_path || first.path || '';
  } catch {
    return '';
  }
}

function parseRawImagePath(content) {
  if (typeof content !== 'string') {
    return '';
  }
  const trimmed = content.trim();
  if (!trimmed || trimmed.startsWith('files:') || trimmed.startsWith('data:image/')) {
    return '';
  }
  return trimmed;
}

function parseFirstImageId(imageId) {
  if (typeof imageId !== 'string' || !imageId.trim()) {
    return '';
  }
  return imageId
    .split(',')
    .map((part) => part.trim())
    .find((part) => part.length > 0) || '';
}

function parseImageDimensionsFromItem(item) {
  const content = typeof item?.content === 'string' ? item.content : '';
  if (!content.startsWith('files:')) {
    return null;
  }

  try {
    const filesData = JSON.parse(content.slice(6));
    const first = filesData?.files?.[0];
    const width = Number(first?.width);
    const height = Number(first?.height);
    if (isFiniteNumber(width) && width > 0 && isFiniteNumber(height) && height > 0) {
      return { width, height };
    }
  } catch {
    return null;
  }

  return null;
}

function estimateTextHeight(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return TEXT_DEFAULT_HEIGHT;
  }

  const lines = text.split(/\r\n|\n|\r/).length;
  const estimated = 22 + lines * 22;
  return Math.max(TEXT_MIN_HEIGHT, estimated);
}

function chooseContainerPosition(mouseX, mouseY, width, height, workArea) {
  const workLeft = workArea.left;
  const workTop = workArea.top;
  const workRight = workLeft + workArea.width;
  const workBottom = workTop + workArea.height;

  if (
    !isFiniteNumber(mouseX) ||
    !isFiniteNumber(mouseY) ||
    !isFiniteNumber(width) ||
    !isFiniteNumber(height) ||
    !isFiniteNumber(workLeft) ||
    !isFiniteNumber(workTop) ||
    !isFiniteNumber(workRight) ||
    !isFiniteNumber(workBottom)
  ) {
    return { left: 0, top: 0 };
  }

  // 右下 -> 左下 -> 左上 -> 右上
  const candidates = [
    { x: mouseX + PREVIEW_OFFSET, y: mouseY + PREVIEW_OFFSET },
    { x: mouseX - PREVIEW_OFFSET - width, y: mouseY + PREVIEW_OFFSET },
    { x: mouseX - PREVIEW_OFFSET - width, y: mouseY - PREVIEW_OFFSET - height },
    { x: mouseX + PREVIEW_OFFSET, y: mouseY - PREVIEW_OFFSET - height },
  ];

  const canFit = (x, y) =>
    x >= workLeft &&
    y >= workTop &&
    x + width <= workRight &&
    y + height <= workBottom;

  const matched = candidates.find((candidate) => canFit(candidate.x, candidate.y));
  const fallback = matched || candidates[0];

  return {
    left: clamp(fallback.x, workLeft, Math.max(workLeft, workRight - width)),
    top: clamp(fallback.y, workTop, Math.max(workTop, workBottom - height)),
  };
}

function createEditorTheme(isDark, isBackground) {
  const textColor = isBackground ? '#ffffff' : 'var(--qc-fg)';
  const subtleTextColor = isBackground ? 'rgba(255, 255, 255, 0.85)' : 'var(--qc-fg-subtle)';
  const textBlendMode = isBackground ? 'difference' : 'normal';

  return EditorView.theme(
    {
      '&': {
        height: '100%',
        backgroundColor: 'transparent',
        color: textColor,
        mixBlendMode: textBlendMode,
      },
      '.cm-scroller': {
        overflow: 'auto',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
        lineHeight: '1.6',
      },
      '.cm-content': {
        padding: '10px 12px',
        color: textColor,
      },
      '.cm-line': {
        backgroundColor: 'transparent',
        textShadow: 'none',
      },
      '.cm-lineNumbers': {
        color: subtleTextColor,
      },
      '.cm-gutters': {
        backgroundColor: 'color-mix(in srgb, var(--qc-panel) 78%, transparent)',
        color: subtleTextColor,
        border: 'none',
      },
      '&.cm-focused': {
        outline: 'none',
      },
      '.cm-activeLine, .cm-activeLineGutter': {
        backgroundColor: 'transparent',
      },
      '.cm-selectionBackground, ::selection': {
        backgroundColor: 'color-mix(in srgb, var(--qc-active) 75%, transparent)',
      },
    },
    { dark: isDark },
  );
}

async function loadItemData(source, itemId) {
  if (source === 'clipboard') {
    const numericId = Number(itemId);
    if (!Number.isFinite(numericId)) {
      throw new Error('剪贴板项目 ID 无效');
    }
    return await invoke('get_clipboard_item_by_id_cmd', { id: numericId });
  }

  if (source === 'favorite') {
    return await invoke('get_favorite_item_by_id_cmd', { id: String(itemId) });
  }

  throw new Error('未知预览来源');
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

function App() {
  const { t } = useTranslation();
  const [previewData, setPreviewData] = useState(null);
  const [textContent, setTextContent] = useState('');
  const [textPreferredHeight, setTextPreferredHeight] = useState(null);
  const [imageUrl, setImageUrl] = useState('');
  const [imageLoadState, setImageLoadState] = useState(IMAGE_STATUS_IDLE);
  const [imageDimensions, setImageDimensions] = useState(null);
  const [imageScale, setImageScale] = useState(1);
  const [showImageScaleIndicator, setShowImageScaleIndicator] = useState(false);
  const [hasMousePosition, setHasMousePosition] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [mousePositionPhysical, setMousePositionPhysical] = useState({ x: 0, y: 0 });
  const editorRootRef = useRef(null);
  const editorViewRef = useRef(null);
  const themeCompartmentRef = useRef(new Compartment());
  const imageScaleIndicatorTimerRef = useRef(null);
  const settings = useSnapshot(settingsStore);
  const { theme, darkThemeStyle, backgroundImagePath } = settings;
  const { effectiveTheme, isDark, isBackground } = useTheme();
  useSettingsSync();

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
    applyThemeToBody(theme || defaultSettings.theme, 'preview');
  }, [theme, darkThemeStyle, effectiveTheme]);

  useEffect(() => {
    const root = editorRootRef.current;
    if (!root || !previewData || previewData.mode !== MODE_TEXT || editorViewRef.current) {
      return;
    }

    const view = new EditorView({
      state: EditorState.create({
        doc: textContent || '',
        extensions: [
          lineNumbers(),
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          EditorView.lineWrapping,
          themeCompartmentRef.current.of(createEditorTheme(isDark, isBackground)),
        ],
      }),
      parent: root,
    });
    editorViewRef.current = view;

    return () => {
      view.destroy();
      editorViewRef.current = null;
    };
  }, [previewData, isDark, isBackground, textContent]);

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === textContent) return;
    view.dispatch({
      changes: {
        from: 0,
        to: current.length,
        insert: textContent || '',
      },
    });
  }, [textContent]);

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) return;
    view.dispatch({
      effects: themeCompartmentRef.current.reconfigure(createEditorTheme(isDark, isBackground)),
    });
  }, [isDark, isBackground]);

  useEffect(() => {
    if (!previewData) return;
    let cancelled = false;

    const run = async () => {
      try {
        const item = await loadItemData(previewData.source, previewData.item_id);
        if (cancelled) return;

        if (previewData.mode === MODE_TEXT) {
          const content = item?.content || '';
          setTextContent(content);
          setTextPreferredHeight(estimateTextHeight(content));
          setImageDimensions(null);
          setImageUrl('');
          setImageLoadState(IMAGE_STATUS_IDLE);
          setImageScale(1);
          return;
        }

        if (previewData.mode === MODE_IMAGE) {
          setImageLoadState(IMAGE_STATUS_LOADING);
          setImageUrl('');
          setImageDimensions(parseImageDimensionsFromItem(item));
          const url = await resolveImageUrlFromItem(item);
          if (cancelled) return;
          if (!url) {
            console.warn('图片预览未解析到可用地址:', {
              source: previewData.source,
              itemId: previewData.item_id,
              contentType: item?.content_type,
              imageId: item?.image_id,
            });
            setImageLoadState(IMAGE_STATUS_ERROR);
            setImageDimensions(null);
            setTextContent('');
            setTextPreferredHeight(null);
            return;
          }
          setImageUrl(url);
          setImageLoadState(IMAGE_STATUS_LOADING);
          setImageScale(1);
          setTextContent('');
          setTextPreferredHeight(null);
        }
      } catch (error) {
        console.error('加载预览内容失败:', error);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [previewData]);

  useEffect(() => {
    return () => {
      if (imageScaleIndicatorTimerRef.current) {
        clearTimeout(imageScaleIndicatorTimerRef.current);
        imageScaleIndicatorTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (previewData?.mode === MODE_IMAGE) {
      return;
    }

    setShowImageScaleIndicator(false);
    if (imageScaleIndicatorTimerRef.current) {
      clearTimeout(imageScaleIndicatorTimerRef.current);
      imageScaleIndicatorTimerRef.current = null;
    }
  }, [previewData?.mode]);

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
  }, [previewData, hasMousePosition, previewData?.mode]);

  useEffect(() => {
    if (!previewData || previewData.mode !== MODE_TEXT) {
      return;
    }

    const view = editorViewRef.current;
    if (!view) {
      return;
    }

    const timer = setTimeout(() => {
      const docHeight = Number(view.contentHeight) || 0;
      const scrollerHeight = Number(view.scrollDOM?.scrollHeight) || 0;
      let measured = docHeight > 0 ? docHeight : scrollerHeight;
      if (docHeight > 0 && scrollerHeight > docHeight && scrollerHeight - docHeight <= 40) {
        measured = scrollerHeight;
      }
      if (!isFiniteNumber(measured) || measured <= 0) {
        return;
      }
      setTextPreferredHeight((prev) => {
        const safeHeight = Math.max(TEXT_MIN_HEIGHT, Math.ceil(measured + 2));
        if (isFiniteNumber(prev) && Math.abs(prev - safeHeight) < 1) {
          return prev;
        }
        return safeHeight;
      });
    }, 0);

    return () => clearTimeout(timer);
  }, [previewData, textContent, isDark]);

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
      if (previewData.mode === MODE_TEXT) {
        const delta = direction === 'up' ? -TEXT_SCROLL_STEP : TEXT_SCROLL_STEP;
        editorViewRef.current?.scrollDOM?.scrollBy({ top: delta, behavior: 'auto' });
        return;
      }

      if (previewData.mode === MODE_IMAGE) {
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
  }, [previewData]);

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

  const boxSize = useMemo(() => {
    return resolveBoxSize(previewData?.mode, workAreaLogical.height, workAreaLogical.width, {
      textHeight: textPreferredHeight,
      imageWidth: imageDimensions?.width,
      imageHeight: imageDimensions?.height,
    });
  }, [previewData, workAreaLogical.height, workAreaLogical.width, textPreferredHeight, imageDimensions]);

  const displaySize = useMemo(() => {
    if (previewData?.mode === MODE_IMAGE) {
      return {
        width: boxSize.width * imageScale,
        height: boxSize.height * imageScale,
      };
    }

    return {
      width: boxSize.width,
      height: boxSize.height,
    };
  }, [previewData, boxSize, imageScale]);

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
    );
  }, [previewData, mousePositionLogical, displaySize, workAreaLogical]);

  const imageScalePercent = useMemo(() => `${Math.round(imageScale * 100)}%`, [imageScale]);
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
  const previewHintClassName = 'px-2 py-0.5 rounded text-[11px] leading-4 text-qc-fg border border-qc-border/70 shadow-sm select-none whitespace-nowrap';
  const previewHintStyle = {
    backgroundColor: 'color-mix(in srgb, var(--qc-surface) 72%, transparent)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
  };

  if (!previewData || !hasMousePosition) {
    return <div className="preview-container fixed inset-0 overflow-hidden bg-transparent" />;
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

  return (
    <div className={`preview-container fixed inset-0 overflow-hidden bg-transparent ${isDark ? 'dark' : ''}`}>
      {previewData.mode === MODE_TEXT && (
        <div
          className="absolute z-20 pointer-events-none"
          style={{
            left: `${relativeLeft}px`,
            top: `${previewHintTop}px`,
            opacity: isVisible ? 1 : 0,
            transition: 'opacity 90ms ease-out',
          }}
        >
          <div className={previewHintClassName} style={previewHintStyle}>
            {t('previewWindow.textHint')}
          </div>
        </div>
      )}

      {previewData.mode === MODE_TEXT && (
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
            ...textContainerBackgroundImageStyle,
          }}
        >
          <div className="w-full h-full overflow-hidden">
            <div ref={editorRootRef} className="w-full h-full" />
          </div>
        </div>
      )}

      {previewData.mode === MODE_IMAGE && (
        <div
          className="absolute z-20 pointer-events-none"
          style={{
            left: `${relativeLeft}px`,
            top: `${previewHintTop}px`,
            opacity: isVisible ? 1 : 0,
            transition: 'opacity 90ms ease-out',
          }}
        >
          <div className="flex items-center gap-2">
            <div className={previewHintClassName} style={previewHintStyle}>
              {t('previewWindow.imageHint')}
            </div>
            {showImageScaleIndicator && (
              <div className={previewHintClassName} style={previewHintStyle}>
                {imageScalePercent}
              </div>
            )}
          </div>
        </div>
      )}

      {previewData.mode === MODE_IMAGE && (
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
          <div className="w-full h-full overflow-visible flex items-start justify-start">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt="图片预览"
                className="w-full h-full object-contain select-none pointer-events-none block"
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
                style={{
                  objectPosition: 'left top',
                  filter: 'drop-shadow(0 0 5px rgba(0, 0, 0, 0.3)) drop-shadow(0 0 3px rgba(0, 0, 0, 0.2))',
                }}
              />
            ) : imageLoadState === IMAGE_STATUS_ERROR ? (
              <div className="text-xs text-qc-fg-muted bg-qc-panel/80 rounded px-2 py-1 inline-block">
                图片不可用
              </div>
            ) : (
              <div className="w-full h-full" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
