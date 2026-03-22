import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { sanitizeHTML } from '@shared/utils/htmlProcessor';

const PLACEHOLDER_SRC = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeGxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiBmaWxsPSIjZjBmMGYwIi8+PC9zdmc+';
const ERROR_SRC = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeGxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiBmaWxsPSIjZmZlYmVlIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtc2l6ZT0iMTIiIGZpbGw9IiNjNjI4MjgiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj7lpb3ml7bplK7mj5DmnKzmiqUgPC90ZXh0Pjwvc3ZnPg==';

const RESPONSIVE_LAYOUT_TAGS = new Set([
  'DIV',
  'P',
  'SECTION',
  'ARTICLE',
  'HEADER',
  'FOOTER',
  'MAIN',
  'ASIDE',
  'NAV',
  'BLOCKQUOTE',
  'LI',
  'UL',
  'OL',
  'SPAN',
  'STRONG',
  'EM',
  'B',
  'I',
  'U',
  'S',
  'SUB',
  'SUP',
  'SMALL',
  'FIGURE',
  'FIGCAPTION',
  'A',
]);

const MEDIA_TAGS = new Set(['IMG', 'VIDEO', 'CANVAS', 'SVG', 'IFRAME', 'OBJECT', 'EMBED']);
const PRESERVE_INTRINSIC_WIDTH_TAGS = new Set(['TABLE', 'IMG', 'VIDEO', 'CANVAS', 'SVG', 'IFRAME', 'OBJECT', 'EMBED']);

function setImportantStyle(style, property, value) {
  style.setProperty(property, value, 'important');
}

function normalizeHtmlLayout(root) {
  if (!root) {
    return;
  }

  const elements = [root, ...root.querySelectorAll('*')];

  for (const element of elements) {
    if (!element || !element.style) {
      continue;
    }

    const tagName = element.tagName;

    setImportantStyle(element.style, 'box-sizing', 'border-box');
    setImportantStyle(element.style, 'min-width', '0');
    setImportantStyle(element.style, 'overflow-wrap', 'anywhere');
    setImportantStyle(element.style, 'word-break', 'break-word');

    if (tagName === 'PRE' || tagName === 'CODE') {
      setImportantStyle(element.style, 'white-space', 'pre-wrap');
      setImportantStyle(element.style, 'overflow-x', 'auto');
      setImportantStyle(element.style, 'width', 'auto');
      setImportantStyle(element.style, 'max-width', 'none');
    } else if (tagName === 'TABLE') {
      setImportantStyle(element.style, 'width', 'auto');
      setImportantStyle(element.style, 'table-layout', 'auto');
      setImportantStyle(element.style, 'border-collapse', 'collapse');
    } else if (tagName === 'IMG') {
      setImportantStyle(element.style, 'display', 'inline-block');
      setImportantStyle(element.style, 'width', 'auto');
      setImportantStyle(element.style, 'height', 'auto');
      setImportantStyle(element.style, 'max-width', 'none');
      setImportantStyle(element.style, 'object-fit', 'contain');
    } else if (MEDIA_TAGS.has(tagName)) {
      setImportantStyle(element.style, 'width', 'auto');
      setImportantStyle(element.style, 'height', 'auto');
      setImportantStyle(element.style, 'max-width', 'none');
    } else if (RESPONSIVE_LAYOUT_TAGS.has(tagName)) {
      setImportantStyle(element.style, 'width', 'auto');
      setImportantStyle(element.style, 'white-space', 'normal');
    }

    if (element !== root) {
      if (element.style.position && element.style.position !== 'static') {
        setImportantStyle(element.style, 'position', 'static');
        setImportantStyle(element.style, 'top', 'auto');
        setImportantStyle(element.style, 'right', 'auto');
        setImportantStyle(element.style, 'bottom', 'auto');
        setImportantStyle(element.style, 'left', 'auto');
      }

      if (element.style.float && element.style.float !== 'none') {
        setImportantStyle(element.style, 'float', 'none');
      }

      if (element.style.transform && element.style.transform !== 'none') {
        setImportantStyle(element.style, 'transform', 'none');
      }
    }

    if (!PRESERVE_INTRINSIC_WIDTH_TAGS.has(tagName)) {
      element.removeAttribute('width');
      element.removeAttribute('height');
    }
  }
}

function resolveImageIdToAsset(imageId) {
  return invoke('get_data_directory').then((dataDir) => {
    const filePath = `${dataDir}/clipboard_images/${imageId}.png`;
    return convertFileSrc(filePath, 'asset');
  });
}

const HtmlPreview = forwardRef(function HtmlPreview({ htmlContent, onPreferredSizeChange }, ref) {
  const scrollContainerRef = useRef(null);
  const contentRef = useRef(null);
  const [renderedHtml, setRenderedHtml] = useState('');
  const onPreferredSizeChangeRef = useRef(onPreferredSizeChange);
  const maxPreferredSizeRef = useRef({ width: 0, height: 0 });
  const measureTimerRef = useRef(0);

  useImperativeHandle(
    ref,
    () => ({
      scrollBy(delta) {
        scrollContainerRef.current?.scrollBy({ top: delta, behavior: 'auto' });
      },
    }),
    [],
  );

  useEffect(() => {
    onPreferredSizeChangeRef.current = onPreferredSizeChange;
  }, [onPreferredSizeChange]);

  useEffect(() => {
    const html = typeof htmlContent === 'string' ? htmlContent : '';
    setRenderedHtml(sanitizeHTML(html));
    maxPreferredSizeRef.current = { width: 0, height: 0 };
  }, [htmlContent]);

  const scheduleMeasure = () => {
    if (measureTimerRef.current) {
      cancelAnimationFrame(measureTimerRef.current);
    }

    measureTimerRef.current = requestAnimationFrame(() => {
      measureTimerRef.current = 0;

      const root = contentRef.current;
      if (!root) {
        return;
      }

      const width = Math.ceil(Number(root.scrollWidth) || 0);
      const height = Math.ceil(Number(root.scrollHeight) || 0);
      if (width <= 0 || height <= 0) {
        return;
      }

      const nextWidth = Math.max(maxPreferredSizeRef.current.width, width + 2);
      const nextHeight = height + 2;
      if (nextWidth === maxPreferredSizeRef.current.width && nextHeight === maxPreferredSizeRef.current.height) {
        return;
      }

      maxPreferredSizeRef.current = {
        width: nextWidth,
        height: nextHeight,
      };

      onPreferredSizeChangeRef.current?.({
        width: nextWidth,
        height: nextHeight,
      });
    });
  };

  useLayoutEffect(() => {
    const root = contentRef.current;
    if (!root) {
      return;
    }

    root.innerHTML = renderedHtml;
    normalizeHtmlLayout(root);
    scheduleMeasure();
  }, [renderedHtml]);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) {
      return undefined;
    }

    let cancelled = false;

    const images = Array.from(root.querySelectorAll('img'));
    const cleanupFns = [];
    if (images.length === 0) {
      return undefined;
    }

    const loadImages = async () => {
      const dataDir = await invoke('get_data_directory');
      if (cancelled) return;

      for (const img of images) {
        const handleImageChange = () => {
          scheduleMeasure();
        };
        img.addEventListener('load', handleImageChange);
        img.addEventListener('error', handleImageChange);
        cleanupFns.push(() => {
          img.removeEventListener('load', handleImageChange);
          img.removeEventListener('error', handleImageChange);
        });

        const imageId = img.getAttribute('data-image-id');
        const src = img.getAttribute('src');

        if (imageId) {
          const originalSrc = img.src;
          img.src = PLACEHOLDER_SRC;
          img.classList.add('html-image-pending');
          try {
            const filePath = `${dataDir}/clipboard_images/${imageId}.png`;
            img.src = convertFileSrc(filePath, 'asset');
          } catch (error) {
            console.error('加载本地图片失败，恢复原始src:', error, 'imageId:', imageId);
            img.src = originalSrc;
          } finally {
            img.classList.remove('html-image-pending');
          }
          scheduleMeasure();
          continue;
        }

        if (src && src.startsWith('image-id:')) {
          const legacyImageId = src.substring(9);
          img.src = PLACEHOLDER_SRC;
          img.classList.add('html-image-pending');
          try {
            img.src = await resolveImageIdToAsset(legacyImageId);
          } catch (error) {
            console.error('加载 HTML 图片失败:', error, 'imageId:', legacyImageId);
            img.src = ERROR_SRC;
            img.alt = '图片加载失败';
          } finally {
            img.classList.remove('html-image-pending');
          }
          scheduleMeasure();
        }
      }
    };

    loadImages().catch((error) => {
      console.error('处理 HTML 图片失败:', error);
    });

    return () => {
      cancelled = true;
      cleanupFns.forEach((fn) => fn());
    };
  }, [renderedHtml]);

  useEffect(() => {
    return () => {
      if (measureTimerRef.current) {
        cancelAnimationFrame(measureTimerRef.current);
        measureTimerRef.current = 0;
      }
    };
  }, []);

  return (
    <div ref={scrollContainerRef} className="w-full h-full min-h-0 min-w-0 overflow-auto">
      <div
        ref={contentRef}
        className="w-full max-w-full min-w-0 text-sm text-qc-fg leading-relaxed html-content min-h-full"
        style={{
          wordBreak: 'break-word',
          overflowWrap: 'anywhere',
          padding: '10px 12px',
          isolation: 'isolate',
        }}
      />
    </div>
  );
});

export default HtmlPreview;
