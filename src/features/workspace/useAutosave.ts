import { useEffect } from "react";
import { isDirty } from "../../shared/document";
import type { WorkspaceApi } from "./useWorkspace";

interface Options {
  enabled: boolean;
  seconds: number;
  workspace: Pick<WorkspaceApi, "ws" | "latest">;
  isBusy: () => boolean;
  saveTab: (id: string, saveAs: boolean, silent: boolean) => Promise<boolean>;
}

/**
 * Periodically write every changed document that is linked to a file we already have access to.
 * It never prompts and never touches the editor, so undo history is preserved.
 */
export function useAutosave({ enabled, seconds, workspace, isBusy, saveTab }: Options) {
  const { latest } = workspace;
  const anyLinked = workspace.ws.tabs.some((t) => t.handle !== undefined);

  useEffect(() => {
    if (!enabled || !anyLinked) return;
    const timer = setInterval(() => {
      if (isBusy()) return;
      for (const t of latest().tabs) {
        if (t.handle && isDirty(t.doc)) void saveTab(t.doc.id, false, true);
      }
    }, seconds * 1000);
    return () => clearInterval(timer);
  }, [enabled, seconds, anyLinked, latest, isBusy, saveTab]);
}
