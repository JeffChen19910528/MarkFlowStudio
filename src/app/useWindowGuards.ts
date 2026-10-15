import { useEffect } from "react";

/** Keep the browser tab title in sync with the document, and warn before the page is closed with unsaved work. */
export function useWindowGuards(title: string, titleDirty: boolean, anyUnsaved: boolean) {
  useEffect(() => {
    document.title = `${titleDirty ? "● " : ""}${title} — MarkFlow Studio`;
  }, [title, titleDirty]);

  useEffect(() => {
    if (!anyUnsaved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [anyUnsaved]);
}
