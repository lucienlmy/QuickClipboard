import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { TEXT_MIN_HEIGHT, isFiniteNumber } from '../utils';

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
    onPreferredHeightChange,
  },
  ref,
) {
  const editorRootRef = useRef(null);
  const editorViewRef = useRef(null);
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
  }, [content]);

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) return;
    view.dispatch({
      effects: themeCompartmentRef.current.reconfigure(createEditorTheme(isDark, isBackground)),
    });
  }, [isDark, isBackground]);

  useEffect(() => {
    if (typeof onPreferredHeightChange !== 'function') {
      return undefined;
    }

    const timer = setTimeout(() => {
      const view = editorViewRef.current;
      if (!view) return;

      const docHeight = Number(view.contentHeight) || 0;
      const scrollerHeight = Number(view.scrollDOM?.scrollHeight) || 0;
      let measured = docHeight > 0 ? docHeight : scrollerHeight;
      if (docHeight > 0 && scrollerHeight > docHeight && scrollerHeight - docHeight <= 40) {
        measured = scrollerHeight;
      }

      if (!isFiniteNumber(measured) || measured <= 0) {
        return;
      }

      const safeHeight = Math.max(TEXT_MIN_HEIGHT, Math.ceil(measured + 2));
      onPreferredHeightChange(safeHeight);
    }, 0);

    return () => clearTimeout(timer);
  }, [content, isDark, isBackground, onPreferredHeightChange]);

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <div ref={editorRootRef} className="w-full h-full" />
    </div>
  );
});

export default TextPreview;
