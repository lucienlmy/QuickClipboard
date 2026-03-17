import { useRef, useEffect } from 'react';
import { highlightText, scrollToFirstHighlight } from '@shared/utils/highlightText';

// 文本内容组件
function TextContent({ content, lineClampClass, searchKeyword, rowHeight = 'medium', availableHeightPx, clampLines }) {
  const containerRef = useRef(null);
  const hasScrolledRef = useRef(false);
  const prevKeywordRef = useRef('');
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

  const renderedContent = searchKeyword
    ? highlightText(content, searchKeyword)
    : content;

  const clampClass = searchKeyword ? '' : lineClampClass;

  const textClass = rowHeight === 'auto'
    ? 'text-sm leading-normal'
    : 'text-sm';

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
        {renderedContent}
      </div>
    </div>
  );
}
export default TextContent;