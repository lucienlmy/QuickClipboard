import { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { oneDark } from '@codemirror/theme-one-dark';
import { useSnapshot } from 'valtio';
import { settingsStore } from '@shared/store/settingsStore';

function TextEditor({
  content,
  onContentChange,
  onStatsChange,
  wordWrap
}) {
  const {
    t
  } = useTranslation();
  const editorRef = useRef(null);
  const viewRef = useRef(null);
  const wrapCompartment = useRef(new Compartment());
  const themeCompartment = useRef(new Compartment());
  const {
    theme,
    systemIsDark
  } = useSnapshot(settingsStore);
  const isDark = theme === 'dark' || (theme === 'auto' && systemIsDark);
  const getCustomTheme = dark => EditorView.theme({
    '&': {
      height: '100%',
      backgroundColor: dark ? '#111827' : '#ffffff',
      color: dark ? '#e5e7eb' : '#1f2937'
    },
    '.cm-scroller': {
      overflow: 'auto',
      height: '100%'
    },
    '.cm-content': {
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      fontSize: '14px',
      lineHeight: '1.6',
      padding: '16px',
      color: dark ? '#e5e7eb' : '#1f2937'
    },
    '.cm-gutters': {
      backgroundColor: dark ? '#1f2937' : '#f9fafb',
      color: dark ? '#9ca3af' : '#6b7280',
      border: 'none'
    },
    '.cm-line': {
      color: dark ? '#e5e7eb' : '#1f2937'
    },
    '.cm-cursor': {
      borderLeftColor: dark ? '#e5e7eb' : '#1f2937'
    },
    '&.cm-focused .cm-selectionBackground, ::selection': {
      backgroundColor: dark ? 'rgba(59, 130, 246, 0.3)' : 'rgba(59, 130, 246, 0.2)'
    }
  }, {
    dark
  });

  // 初始化编辑器
  useEffect(() => {
    if (!editorRef.current) return;
    const startState = EditorState.create({
      doc: content || '',
      extensions: [lineNumbers(), highlightActiveLine(), history(), themeCompartment.current.of(isDark ? [oneDark, getCustomTheme(true)] : [getCustomTheme(false)]), wrapCompartment.current.of(wordWrap ? EditorView.lineWrapping : []), keymap.of([...defaultKeymap, ...historyKeymap]), EditorView.updateListener.of(update => {
        if (update.docChanged) {
          const newContent = update.state.doc.toString();
          onContentChange(newContent);
          const chars = newContent.length;
          const lines = update.state.doc.lines;
          onStatsChange({
            chars,
            lines
          });
        }
      })]
    });
    const view = new EditorView({
      state: startState,
      parent: editorRef.current
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // 更新内容
  useEffect(() => {
    if (!viewRef.current) return;
    const currentContent = viewRef.current.state.doc.toString();
    if (currentContent !== content) {
      viewRef.current.dispatch({
        changes: {
          from: 0,
          to: currentContent.length,
          insert: content || ''
        }
      });
    }
  }, [content]);

  // 更新换行设置
  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: wrapCompartment.current.reconfigure(wordWrap ? EditorView.lineWrapping : [])
    });
  }, [wordWrap]);

  // 更新主题设置
  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: themeCompartment.current.reconfigure(isDark ? [oneDark, getCustomTheme(true)] : [getCustomTheme(false)])
    });
  }, [isDark]);
  return <div className="flex-1 overflow-hidden">
      <div ref={editorRef} className="h-full w-full" />
    </div>;
}
export default TextEditor;