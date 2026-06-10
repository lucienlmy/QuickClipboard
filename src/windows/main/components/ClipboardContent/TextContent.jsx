import { useRef, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { highlightText, scrollToFirstHighlight } from '@shared/utils/highlightText';
import { toast, TOAST_POSITIONS, TOAST_SIZES } from '@shared/store/toastStore';
import Tooltip from '@shared/components/common/Tooltip.jsx';
import { formatColorCodeLike, parseStandaloneColorCode } from '@shared/utils/colorCode';

// 文本内容组件
function TextContent({
  content,
  lineClampClass,
  searchKeyword,
  rowHeight = 'medium',
  availableHeightPx,
  clampLines,
  item,
  source = 'clipboard'
}) {
  const { t } = useTranslation();
  const containerRef = useRef(null);
  const hasScrolledRef = useRef(false);
  const prevKeywordRef = useRef('');
  const [isPickingColor, setIsPickingColor] = useState(false);
  const colorInfo = useMemo(() => parseStandaloneColorCode(content), [content]);
  const pickColorLabel = t('clipboard.pickColor', '选择颜色');

  useEffect(() => {
    if (searchKeyword !== prevKeywordRef.current) {
      hasScrolledRef.current = false;
      prevKeywordRef.current = searchKeyword;
    }

    if (searchKeyword && containerRef.current && !hasScrolledRef.current) {
      requestAnimationFrame(() => {
        if (scrollToFirstHighlight(containerRef.current)) {
          hasScrolledRef.current = true;
        }
      });
    }
  }, [searchKeyword, content]);

  const handlePickColor = async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (!colorInfo || !item?.id || isPickingColor) {
      return;
    }

    if (typeof window === 'undefined' || !window.EyeDropper) {
      toast.warning(t('clipboard.eyeDropperUnsupported', '当前环境不支持 EyeDropper 取色器'), {
        position: TOAST_POSITIONS.BOTTOM_RIGHT,
        size: TOAST_SIZES.EXTRA_SMALL
      });
      return;
    }

    setIsPickingColor(true);
    try {
      const result = await new window.EyeDropper().open();
      const nextContent = formatColorCodeLike(colorInfo, result.sRGBHex);

      if (source === 'favorite') {
        const { updateFavorite } = await import('@shared/api/favorites');
        await updateFavorite(item.id, item.title || '', nextContent, item.group_name);
      } else {
        const { updateClipboardItem } = await import('@shared/api/clipboard');
        await updateClipboardItem(item.id, nextContent);
      }
    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.error('更新颜色失败:', error);
        toast.error(t('clipboard.colorUpdateFailed', '更新颜色失败'), {
          position: TOAST_POSITIONS.BOTTOM_RIGHT,
          size: TOAST_SIZES.EXTRA_SMALL
        });
      }
    } finally {
      setIsPickingColor(false);
    }
  };

  const renderedContent = searchKeyword
    ? highlightText(content, searchKeyword)
    : content;

  const clampClass = searchKeyword ? '' : lineClampClass;

  const textClass = rowHeight === 'auto'
    ? 'text-sm leading-normal'
    : 'text-sm';
  const contentClass = colorInfo
    ? 'flex h-full items-center gap-2 min-w-0 max-w-full leading-normal'
    : '';

  const computedLineHeightPx = (() => {
    if (rowHeight === 'auto') return undefined;
    if (!availableHeightPx || !clampLines) return undefined;
    const v = Math.floor(availableHeightPx / clampLines);
    if (!Number.isFinite(v) || v <= 0) return undefined;
    return v;
  })();

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <div
        ref={containerRef}
        className={`${textClass} text-qc-fg break-all ${clampClass} overflow-hidden min-h-0 w-full`}
        style={computedLineHeightPx ? { lineHeight: `${computedLineHeightPx}px` } : undefined}
      >
        <span className={contentClass}>
          {colorInfo && (
            <Tooltip content={pickColorLabel} placement="top" asChild>
              <button
                type="button"
                data-no-drag="true"
                aria-label={pickColorLabel}
                className="relative top-[0.5px] block h-4 w-4 flex-none cursor-pointer rounded-[4px] border border-qc-border-strong p-0 leading-none shadow-sm transition-transform duration-150 hover:scale-110 disabled:cursor-wait disabled:opacity-70"
                style={{ backgroundColor: colorInfo.srgbHex }}
                disabled={isPickingColor}
                onClick={handlePickColor}
                onMouseDown={(event) => event.stopPropagation()}
              />
            </Tooltip>
          )}
          <span className="min-w-0 break-all leading-normal">{renderedContent}</span>
        </span>
      </div>
    </div>
  );
}
export default TextContent;
