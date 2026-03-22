import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { useSnapshot } from 'valtio';
import { defaultSettings } from '@shared/services/settingsService';
import { settingsStore, initSettings } from '@shared/store/settingsStore';
import { useTheme, applyThemeToBody } from '@shared/hooks/useTheme';
import { useSettingsSync } from '@shared/hooks/useSettingsSync';
import { getClipboardItemById, getFavoriteItemById } from '@shared/api';
import {
  ImagePreview,
  HtmlPreview,
  PreviewHint,
  TextPreview,
} from './views';
import {
  MODE_TEXT,
  MODE_HTML,
  MODE_IMAGE,
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
  const [previewMode, setPreviewMode] = useState(MODE_TEXT);
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
  const textPreviewRef = useRef(null);
  const htmlPreviewRef = useRef(null);
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
    initSettings().catch(() => {});
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
    if (!previewData) return;
    let cancelled = false;

    setPreviewMode(
      previewData.mode === MODE_IMAGE
        ? MODE_IMAGE
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
        const item = await loadItemData(previewData.source, previewData.item_id);
        if (cancelled) return;

        const nextMode = resolvePreviewMode(previewData.mode, item);
        setPreviewMode(nextMode);
        setTextContent(item?.content || '');
        setTextPreferredHeight(estimateTextHeight(item?.content || ''));

        if (nextMode === MODE_IMAGE) {
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
            setHtmlContent('');
            setTextPreferredHeight(null);
            return;
          }
          setImageUrl(url);
          setImageLoadState(IMAGE_STATUS_LOADING);
          setImageScale(1);
          setTextContent('');
          setHtmlContent('');
          setTextPreferredHeight(null);
          return;
        }

        setImageUrl('');
        setImageLoadState(IMAGE_STATUS_IDLE);
        setImageDimensions(null);
        setImageScale(1);
        setHtmlPreferredSize(null);
        setHtmlContent(nextMode === MODE_HTML ? (item?.html_content || '') : '');
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
        .catch(() => {})
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
      unlistenPromise.then((unlisten) => unlisten()).catch(() => {});
    };
  }, [previewData, previewMode]);

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
    return resolveBoxSize(previewMode, workAreaLogical.height, workAreaLogical.width, {
      textHeight: textPreferredHeight,
      imageWidth: imageDimensions?.width,
      imageHeight: imageDimensions?.height,
      htmlWidth: htmlPreferredSize?.width,
      htmlHeight: htmlPreferredSize?.height,
    });
  }, [
    previewMode,
    workAreaLogical.height,
    workAreaLogical.width,
    textPreferredHeight,
    imageDimensions,
    htmlPreferredSize,
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

  const renderPreviewHint = () => {
    if (previewMode === MODE_IMAGE) {
      return (
        <div className="flex items-center gap-2">
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

    return (
      <div className="flex items-center gap-2">
        {previewMode === MODE_HTML && (
          <PreviewHint style={previewHintStyle}>
            HTML
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
        className="absolute z-20 pointer-events-none"
        style={{
          left: `${relativeLeft}px`,
          top: `${previewHintTop}px`,
          opacity: isVisible ? 1 : 0,
          transition: 'opacity 90ms ease-out',
        }}
      >
        {renderPreviewHint()}
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
            ...textContainerBackgroundImageStyle,
          }}
        >
          <div className="w-full h-full overflow-hidden">
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
