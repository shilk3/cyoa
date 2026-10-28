import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { setDiagnostics, lintGutter, type Diagnostic } from '@codemirror/lint';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { inkLanguage } from './inkLanguage';
import type { CompileIssue } from '../ink/compile';

export interface InkEditorHandle {
  goToLine(line: number): void;
  insertAtCursor(text: string): void;
}

interface Props {
  value: string;
  issues: CompileIssue[];
  onChange: (value: string) => void;
}

export const InkEditor = forwardRef<InkEditorHandle, Props>(function InkEditor({ value, issues, onChange }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          drawSelection(),
          history(),
          highlightSelectionMatches(),
          lintGutter(),
          EditorView.lineWrapping,
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
          inkLanguage,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString());
          }),
          EditorView.contentAttributes.of({ 'aria-label': 'Ink source', spellcheck: 'true' }),
        ],
      }),
    });
    view.current = v;
    return () => v.destroy();
    // The editor owns its document after mount; `value` is only the initial content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const doc = v.state.doc;
    const diags: Diagnostic[] = issues.map((i) => {
      const line = doc.line(Math.min(Math.max(i.line ?? 1, 1), doc.lines));
      return {
        from: line.from,
        to: line.to,
        severity: i.level === 'error' ? 'error' : i.level === 'warning' ? 'warning' : 'info',
        message: i.message,
      };
    });
    v.dispatch(setDiagnostics(v.state, diags));
  }, [issues]);

  useImperativeHandle(ref, () => ({
    goToLine(n: number) {
      const v = view.current;
      if (!v) return;
      const line = v.state.doc.line(Math.min(Math.max(n, 1), v.state.doc.lines));
      v.dispatch({ selection: { anchor: line.from }, effects: EditorView.scrollIntoView(line.from, { y: 'center' }) });
      v.focus();
    },
    insertAtCursor(text: string) {
      const v = view.current;
      if (!v) return;
      const pos = v.state.selection.main.head;
      v.dispatch({ changes: { from: pos, insert: text }, selection: { anchor: pos + text.length } });
      v.focus();
    },
  }));

  return <div className="ink-editor" ref={host} />;
});
