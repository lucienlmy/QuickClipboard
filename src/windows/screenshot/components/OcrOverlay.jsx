function OcrOverlay({ result, selection }) {
  if (!result || !selection) return null;

  return (
    <>
      {/* 半透明遮罩 */}
      <div
        className="absolute bg-black/40 backdrop-blur-sm pointer-events-none"
        style={{
          left: selection.x,
          top: selection.y,
          width: selection.width,
          height: selection.height,
          zIndex: 1000,
        }}
      />

      {/* 识别结果文本覆盖 - 按单词渲染，可选中 */}
      {result.lines.map((line, lineIndex) => (
        <div key={lineIndex}>
          {line.words.map((word, wordIndex) => {
            const relativeX = selection.x + word.x;
            const relativeWordY = selection.y + word.y;
            
            return (
              <div
                key={`${lineIndex}-${wordIndex}`}
                className="absolute select-text cursor-text"
                style={{
                  left: relativeX,
                  top: relativeWordY,
                  width: word.width,
                  height: word.height,
                  zIndex: 1001,
                  fontSize: Math.max(12, word.height),
                  color: 'white',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  userSelect: 'text',
                  WebkitUserSelect: 'text',
                  MozUserSelect: 'text',
                  msUserSelect: 'text',
                  textShadow: '0 0 4px rgba(0, 0, 0, 0.8), 0 0 8px rgba(0, 0, 0, 0.6)',
                }}
              >
                {word.text}
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}

export default OcrOverlay;
