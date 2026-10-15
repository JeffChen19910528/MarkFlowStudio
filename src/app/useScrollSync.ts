import { useEffect } from "react";
import type { EditorView } from "@codemirror/view";

/** Keep the editor and the preview scrolled to the same relative position while `enabled`. */
export function useScrollSync(view: EditorView | null, previewEl: HTMLElement | null, enabled: boolean) {
  useEffect(() => {
    if (!enabled || !view || !previewEl) return;
    const editorEl = view.scrollDOM;
    let ignore: HTMLElement | null = null;
    const follow = (from: HTMLElement, to: HTMLElement) => () => {
      if (ignore === from) {
        ignore = null;
        return;
      }
      const max = from.scrollHeight - from.clientHeight;
      const target = max > 0 ? (from.scrollTop / max) * (to.scrollHeight - to.clientHeight) : 0;
      if (Math.abs(to.scrollTop - target) < 1) return;
      ignore = to; // swallow the scroll event our own assignment triggers
      to.scrollTop = target;
    };
    const onEditor = follow(editorEl, previewEl);
    const onPreview = follow(previewEl, editorEl);
    editorEl.addEventListener("scroll", onEditor);
    previewEl.addEventListener("scroll", onPreview);
    return () => {
      editorEl.removeEventListener("scroll", onEditor);
      previewEl.removeEventListener("scroll", onPreview);
    };
  }, [view, previewEl, enabled]);
}
