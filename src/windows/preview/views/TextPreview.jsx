import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { TEXT_MIN_HEIGHT, TEXT_MIN_WIDTH, TEXT_WIDTH_BUFFER, isFiniteNumber } from '../utils';

function createEditorTheme(isDark, isBackground) {
  const textColor = isBackground ? '#ffffff' : 'var(--qc-fg)';
  const subtleTextColor = isBackground ? 'rgba(255, 255, 255, 0.85)' : 'var(--qc-fg-subtle)';
  const textBlendMode = 'normal';

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

const TextPreview = forwardRef(function TextPreview(
  {
    content,
    isDark,
    isBackground,
    onPreferredSizeChange,
  },
  ref,
) {
  const editorRootRef = useRef(null);
  const editorViewRef = useRef(null);
  const widthMeasureRef = useRef(null);
  const heightMeasureRef = useRef(null);
  const measureTimerRef = useRef(0);
  const observedWidthRef = useRef(0);
  const onPreferredSizeChangeRef = useRef(onPreferredSizeChange);
  const themeCompartmentRef = useRef(new Compartment());

  useImperativeHandle(
    ref,
    () => ({
      scrollBy(delta) {
        editorViewRef.current?.scrollDOM?.scrollBy({ top: delta, behavior: 'auto' });
      },
    }),
    [],
  );

  useEffect(() => {
    onPreferredSizeChangeRef.current = onPreferredSizeChange;
  }, [onPreferredSizeChange]);

  useEffect(() => {
    const root = editorRootRef.current;
    if (!root || editorViewRef.current) {
      return undefined;
    }

    const view = new EditorView({
      state: EditorState.create({
        doc: content || '',
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
  }, []);

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === (content || '')) return;

    view.dispatch({
      changes: {
        from: 0,
        to: current.length,
        insert: content || '',
      },
    });
    view.requestMeasure();
  }, [content]);

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) return;
    view.dispatch({
      effects: themeCompartmentRef.current.reconfigure(createEditorTheme(isDark, isBackground)),
    });
    view.requestMeasure();
  }, [isDark, isBackground]);

  const measurePreferredSize = () => {
    if (measureTimerRef.current) {
      cancelAnimationFrame(measureTimerRef.current);
    }

    measureTimerRef.current = requestAnimationFrame(() => {
      measureTimerRef.current = 0;
      const view = editorViewRef.current;
      const widthMeasureNode = widthMeasureRef.current;
      const heightMeasureNode = heightMeasureRef.current;
      if (!view) return;

      const contentElement = view.dom.querySelector('.cm-content');
      if (contentElement && typeof window !== 'undefined') {
        const computedStyle = window.getComputedStyle(contentElement);
        const syncMeasureStyle = (node) => {
          if (!node) return;
          node.style.fontFamily = computedStyle.fontFamily;
          node.style.fontSize = computedStyle.fontSize;
          node.style.fontWeight = computedStyle.fontWeight;
          node.style.letterSpacing = computedStyle.letterSpacing;
          node.style.lineHeight = computedStyle.lineHeight;
          node.style.padding = computedStyle.padding;
        };
        syncMeasureStyle(widthMeasureNode);
        syncMeasureStyle(heightMeasureNode);
      }

      const contentWidth = Number(widthMeasureNode?.scrollWidth) || 0;
      const gutterWidth = Number(view.dom.querySelector('.cm-gutters')?.getBoundingClientRect().width) || 0;
      const contentViewportWidth = Number(contentElement?.clientWidth) || 0;
      if (heightMeasureNode && contentViewportWidth > 0) {
        heightMeasureNode.style.width = `${contentViewportWidth}px`;
      }

      const measuredHeight = Number(heightMeasureNode?.scrollHeight) || Number(view.contentHeight) || 0;

      if (!isFiniteNumber(measuredHeight) || measuredHeight <= 0) {
        return;
      }

      const safeHeight = Math.max(TEXT_MIN_HEIGHT, Math.ceil(measuredHeight + 2));
      const contentText = typeof content === 'string' ? content.trim() : '';
      const narrowWidthFloor = contentText
        ? Math.max(TEXT_MIN_WIDTH, Math.ceil(gutterWidth + 48))
        : TEXT_MIN_WIDTH;
      const safeWidth = Math.max(
        narrowWidthFloor,
        Math.ceil(gutterWidth + contentWidth + TEXT_WIDTH_BUFFER),
      );

      onPreferredSizeChangeRef.current?.({
        width: safeWidth,
        height: safeHeight,
      });
    });
  };

  useEffect(() => {
    if (typeof onPreferredSizeChangeRef.current !== 'function') {
      return undefined;
    }

    measurePreferredSize();
    return undefined;
  }, [content, isDark, isBackground]);

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view || typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      const nextWidth = Math.round(
        Number(entry?.contentRect?.width) || Number(view.scrollDOM?.clientWidth) || 0,
      );
      if (nextWidth <= 0 || nextWidth === observedWidthRef.current) {
        return;
      }
      observedWidthRef.current = nextWidth;
      view.requestMeasure();
      measurePreferredSize();
    });
    observer.observe(view.scrollDOM);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) {
      return undefined;
    }

    const timer = setTimeout(() => {
      view.requestMeasure();
      measurePreferredSize();
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (measureTimerRef.current) {
        cancelAnimationFrame(measureTimerRef.current);
        measureTimerRef.current = 0;
      }
    };
  }, []);

  return (
    <div className="relative h-full min-h-0 overflow-hidden">
      <div ref={editorRootRef} className="w-full h-full" />
      <div
        ref={widthMeasureRef}
        aria-hidden="true"
        className="pointer-events-none fixed invisible left-[-10000px] top-0"
        style={{
          display: 'inline-block',
          width: 'max-content',
          maxWidth: 'none',
          whiteSpace: 'pre',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
          lineHeight: '1.6',
          padding: '10px 12px',
        }}
      >
        {content || ' '}
      </div>
      <div
        ref={heightMeasureRef}
        aria-hidden="true"
        className="pointer-events-none fixed invisible left-[-10000px] top-0"
        style={{
          display: 'block',
          width: `${Math.max(1, observedWidthRef.current)}px`,
          maxWidth: 'none',
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
          lineHeight: '1.6',
          padding: '10px 12px',
        }}
      >
        {content || ' '}
      </div>
    </div>
  );
});

export default TextPreview;
