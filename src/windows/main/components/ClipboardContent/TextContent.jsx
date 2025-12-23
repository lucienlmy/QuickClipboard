import { useRef, useEffect } from 'react';
import { highlightText, scrollToFirstHighlight } from '@shared/utils/highlightText';

// 文本内容组件
function TextContent({ content, lineClampClass, searchKeyword }) {
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

  return (
    <div
      ref={containerRef}
      className={`text-sm text-gray-800 dark:text-gray-200 break-all leading-relaxed h-full ${clampClass} ${searchKeyword ? 'overflow-y-auto' : 'overflow-hidden'}`}
    >
      {renderedContent}
    </div>
  );
}
export default TextContent;