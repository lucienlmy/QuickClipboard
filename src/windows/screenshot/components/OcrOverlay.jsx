import { useEffect, useRef } from 'react';

function OcrOverlay({ result, selection }) {
  const containerRef = useRef(null);
  
  useEffect(() => {
    const handleCopy = (e) => {
      const selectedText = window.getSelection()?.toString();
      if (selectedText) {
        e.preventDefault();
        e.clipboardData?.setData('text/plain', selectedText);
      }
    };
    
    const container = containerRef.current;
    container?.addEventListener('copy', handleCopy);
    return () => container?.removeEventListener('copy', handleCopy);
  }, []);
  
  if (!result || !selection) return null;

  return (
    <div ref={containerRef}>
      <style>{`
        .ocr-text::selection {
          color: transparent;
          background-color: rgba(59, 130, 246, 0.5);
        }
        .ocr-text:hover {
          text-decoration-color: #22d3ee !important;
        }
      `}</style>
      
      {result.lines.map((line, lineIndex) => {
        const lineX = selection.x + line.x;
        const lineY = selection.y + line.y;
        const lineHeight = line.height;
        const fontSize = Math.max(12, lineHeight * 0.9);
        const lineText = line.words.map(w => w.text).join('');
        
        const charCount = [...lineText].length;
        const avgCharWidth = lineText.split('').reduce((sum, ch) => {
          return sum + (ch.charCodeAt(0) < 128 ? fontSize * 0.55 : fontSize);
        }, 0) / charCount;
        const estimatedWidth = charCount * avgCharWidth;
        
        const extraSpacing = charCount > 1 
          ? Math.max(0, (line.width - estimatedWidth) / (charCount - 1))
          : 0;
        
        return (
          <div
            key={lineIndex}
            className="ocr-text absolute select-text cursor-text whitespace-nowrap"
            style={{
              left: lineX,
              top: lineY,
              height: lineHeight,
              zIndex: 1001,
              fontSize,
              lineHeight: `${lineHeight}px`,
              letterSpacing: `${extraSpacing}px`,
              color: 'transparent',
              fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif',
              userSelect: 'text',
              WebkitUserSelect: 'text',
              textDecoration: 'underline',
              textDecorationColor: 'rgba(59, 130, 246, 0.7)',
              textDecorationThickness: '2px',
              textUnderlineOffset: '2px',
              filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.8))',
            }}
          >
            {lineText}
          </div>
        );
      })}
    </div>
  );
}

export default OcrOverlay;
