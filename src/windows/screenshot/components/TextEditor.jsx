import React, { useEffect, useRef } from 'react';
import { Html } from 'react-konva-utils';

//文本编辑器组件

const TextEditor = ({ shape, onTextChange, onClose }) => {
  const textareaRef = useRef(null);

  const adjustHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '1px';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = scrollHeight + 'px';
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.select();
        adjustHeight();
      }
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  const confirmEdit = () => {
    if (textareaRef.current) {
      onTextChange?.(textareaRef.current.value);
    }
    onClose?.();
  };

  const handleKeyDown = (e) => {
    e.stopPropagation();

    // Ctrl/Cmd+Enter 完成编辑
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      confirmEdit();
    }
    // Escape 取消编辑
    else if (e.key === 'Escape') {
      e.preventDefault();
      onClose?.();
    }
    // Enter 换行
  };

  const handleBlur = () => {
    setTimeout(() => {
      confirmEdit();
    }, 150);
  };

  if (!shape) return null;

  const width = shape.width || 200;
  const fontSize = shape.fontSize || 24;
  const fontFamily = shape.fontFamily || 'Arial, Microsoft YaHei, sans-serif';
  
  const fontStyleArray = Array.isArray(shape.fontStyle) ? shape.fontStyle : [];
  const fontWeight = fontStyleArray.includes('bold') ? 'bold' : 'normal';
  const fontStyle = fontStyleArray.includes('italic') ? 'italic' : 'normal';
  
  const textAlign = shape.align || 'left';
  const color = shape.fill || '#ff4d4f';
  const lineHeight = shape.lineHeight || 1.2;

  return (
    <Html
      groupProps={{ x: shape.x, y: shape.y }}
      divProps={{
        style: {
          position: 'absolute',
          top: 0,
          left: 0,
          pointerEvents: 'auto',
        },
      }}
    >
      <textarea
        ref={textareaRef}
        defaultValue={shape.text || ''}
        onInput={adjustHeight}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onMouseDown={(e) => e.stopPropagation()}
        placeholder="输入文本..."
        className="resize-none border-none outline-none bg-transparent rounded whitespace-pre-wrap overflow-hidden block box-border"
        style={{
          width: `${width}px`,
          fontSize: `${fontSize}px`,
          fontFamily,
          fontWeight,
          fontStyle,
          transform: fontStyle === 'italic' ? 'skewX(-8deg)' : 'none',
          color,
          textAlign,
          lineHeight: `${lineHeight}`,
          padding: '0',
          margin: '0',
          boxSizing: 'border-box',
        }}
      />
    </Html>
  );
};

export default TextEditor;
