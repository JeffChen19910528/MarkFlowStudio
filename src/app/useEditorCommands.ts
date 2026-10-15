import { useCallback, useRef, useState } from "react";
import { redo, undo } from "@codemirror/commands";
import { openSearchPanel } from "@codemirror/search";
import { EditorView } from "@codemirror/view";

/**
 * The only place that talks to the CodeMirror view. `onReady` is handed to the editor component;
 * everything else is a command the rest of the app can call without knowing about CodeMirror.
 */
export function useEditorCommands() {
  const viewRef = useRef<EditorView | null>(null);
  const [view, setView] = useState<EditorView | null>(null);

  const onReady = useCallback((v: EditorView | null) => {
    viewRef.current = v;
    setView(v);
  }, []);

  const run = useCallback((fn: (v: EditorView) => void) => {
    const v = viewRef.current;
    if (!v) return;
    fn(v);
    v.focus();
  }, []);

  const focus = useCallback(() => viewRef.current?.focus(), []);

  /** Move the cursor to a 0-based line and scroll it to the top. */
  const jumpToLine = useCallback((line: number, takeFocus: boolean) => {
    const v = viewRef.current;
    if (!v) return;
    const target = v.state.doc.line(Math.min(line + 1, v.state.doc.lines));
    v.dispatch({ selection: { anchor: target.from }, effects: EditorView.scrollIntoView(target.from, { y: "start" }) });
    if (takeFocus) v.focus();
  }, []);

  return {
    view,
    onReady,
    focus,
    jumpToLine,
    undo: useCallback(() => run((v) => undo(v)), [run]),
    redo: useCallback(() => run((v) => redo(v)), [run]),
    openSearch: useCallback(() => run((v) => openSearchPanel(v)), [run]),
  };
}
