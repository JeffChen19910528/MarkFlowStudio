import { useCallback, useEffect, useRef, useState } from "react";
import { getLanguage, t } from "../../i18n";
import { importDocument } from "../../importers";
import type { ImportFormat } from "../../importers/types";
import type { FileApi, OpenedFile, RecentFile } from "../../platform/types";
import { isDirty, markSaved, newDocument, withEdit } from "../../shared/document";
import { FileError } from "../../shared/errors";
import type { StatusSink } from "../../shared/status";
import { MAX_TABS, activeTab, findTab, findTabByHandle, isPristine } from "../../shared/workspace";
import type { RecentFilesApi } from "./useRecentFiles";
import type { WorkspaceApi } from "./useWorkspace";

export interface ImportReportInfo {
  fileName: string;
  format: ImportFormat;
  warnings: string[];
}

interface Options {
  workspace: WorkspaceApi;
  files: FileApi;
  recents: RecentFilesApi;
  status: StatusSink;
  /** Called when "new" is pressed while the current document is already empty. */
  focusEditor: () => void;
}

/**
 * Everything the user can do with documents that involves files: save, open, import, reopen a recent
 * file, close with a save prompt, and choose the image folder. It depends on the `FileApi` interface,
 * not on any browser API.
 */
export function useDocumentActions({ workspace, files, recents, status, focusEditor }: Options) {
  const { setStatus, reportError } = status;
  const { latest, canAdd, addTab, addEmptyDocument, activateTab, updateById, closeNow, setActiveImageFolder } = workspace;
  const { record: recordRecent, forget: forgetRecent } = recents;

  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  useEffect(() => {
    busyRef.current = busy;
  });
  const isBusy = useCallback(() => busyRef.current, []);

  /** Id of a changed tab the user asked to close; shows the save/discard/cancel prompt. */
  const [closing, setClosing] = useState<string | null>(null);
  const [importReport, setImportReport] = useState<ImportReportInfo | null>(null);
  const saving = useRef(new Set<string>());

  const tabLimitError = useCallback(
    () => setStatus({ kind: "error", text: t("action.tooManyTabs", { n: MAX_TABS }) }),
    [setStatus],
  );

  /**
   * Save one tab. Returns true when saved (false on cancel or failure).
   * `silent` is used by autosave: no busy lock and no success banner.
   */
  const saveTab = useCallback(
    async (id: string, saveAs: boolean, silent = false): Promise<boolean> => {
      const tab = findTab(latest(), id);
      if (!tab || saving.current.has(id)) return false;
      saving.current.add(id);
      if (!silent) setBusy(true);
      const text = tab.doc.markdown;
      try {
        const result =
          saveAs || !tab.handle
            ? await files.saveFileAs(text, tab.doc.title)
            : await files.saveFile(text, tab.doc.title, tab.handle);
        if (!result) return false;
        const stamp = silent ? new Date().toLocaleTimeString(getLanguage(), { hour12: false }) : undefined;
        updateById(id, (t) => ({ ...t, doc: markSaved(t.doc, result.name, text), handle: result.handle, autoSavedAt: stamp }));
        if (!silent) {
          setStatus({
            kind: "success",
            text: result.handle ? t("action.saved", { name: result.name }) : t("action.downloaded", { name: result.name }),
          });
          if (result.handle) void recordRecent(result.handle);
        }
        return true;
      } catch (e) {
        reportError(e);
        return false;
      } finally {
        saving.current.delete(id);
        if (!silent) setBusy(false);
      }
    },
    [latest, files, updateById, recordRecent, setStatus, reportError],
  );

  const saveActive = useCallback((saveAs: boolean) => saveTab(latest().activeId, saveAs), [saveTab, latest]);

  const newDocumentTab = useCallback(() => {
    setStatus(null);
    if (isPristine(activeTab(latest()))) return focusEditor(); // already an empty untitled document
    if (!canAdd()) return tabLimitError();
    addEmptyDocument();
  }, [setStatus, latest, focusEditor, canAdd, tabLimitError, addEmptyDocument]);

  /** Show an opened file in a tab: switch to it if it is already open, otherwise add a tab. */
  const showOpened = useCallback(
    async (file: OpenedFile) => {
      if (file.handle) {
        const existing = await findTabByHandle(latest(), file.handle);
        if (existing) {
          activateTab(existing.doc.id);
          setStatus({ kind: "info", text: t("action.alreadyOpen", { name: file.name }) });
          return;
        }
      }
      if (!canAdd()) return tabLimitError();
      addTab({ doc: newDocument(file.text, file.name, true), handle: file.handle });
      setStatus({ kind: "info", text: t("action.opened", { name: file.name }) });
      if (file.handle) void recordRecent(file.handle);
    },
    [latest, activateTab, canAdd, addTab, setStatus, tabLimitError, recordRecent],
  );

  const openFile = useCallback(async () => {
    setBusy(true);
    try {
      const file = await files.openFile();
      if (file) await showOpened(file);
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }, [files, showOpened, reportError]);

  const openRecent = useCallback(
    async (recent: RecentFile) => {
      setBusy(true);
      try {
        await showOpened(await files.openFromRef(recent.handle));
      } catch (e) {
        if (e instanceof FileError && e.code === "not-found") await forgetRecent(recent.id); // the file is gone
        reportError(e);
      } finally {
        setBusy(false);
      }
    },
    [files, showOpened, forgetRecent, reportError],
  );

  const importFile = useCallback(async () => {
    setBusy(true);
    setStatus({ kind: "info", text: t("action.importing") });
    try {
      const picked = await files.pickImportFile();
      if (!picked) {
        setStatus(null);
        return;
      }
      const result = await importDocument(picked.name, picked.buffer);
      if (!canAdd()) return tabLimitError();
      // The imported text is a new, unsaved document: it never overwrites the source file.
      const base = picked.name.replace(/\.[^.]+$/, "") || t("doc.imported");
      addTab({ doc: withEdit(newDocument("", `${base}.md`), result.markdown) });
      setImportReport({ fileName: picked.name, format: result.sourceFormat, warnings: result.warnings });
      setStatus(null);
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }, [files, setStatus, canAdd, tabLimitError, addTab, reportError]);

  const pickImageFolder = useCallback(async () => {
    try {
      const folder = await files.pickImageFolder();
      if (!folder) return;
      setActiveImageFolder(folder);
      setStatus({ kind: "info", text: t("action.folderChosen", { name: folder.name }) });
    } catch (e) {
      reportError(e);
    }
  }, [files, setActiveImageFolder, setStatus, reportError]);

  const clearImageFolder = useCallback(() => setActiveImageFolder(undefined), [setActiveImageFolder]);

  const requestClose = useCallback(
    (id: string) => {
      const tab = findTab(latest(), id);
      if (!tab) return;
      if (isDirty(tab.doc)) setClosing(id);
      else closeNow(id);
    },
    [latest, closeNow],
  );

  const resolveClosing = useCallback(
    async (choice: "save" | "discard" | "cancel") => {
      const id = closing;
      setClosing(null);
      if (!id || choice === "cancel") return;
      if (choice === "save" && !(await saveTab(id, false))) return;
      closeNow(id);
    },
    [closing, saveTab, closeNow],
  );

  const dismissImportReport = useCallback(() => setImportReport(null), []);

  return {
    busy,
    isBusy,
    saveTab,
    saveActive,
    newDocumentTab,
    openFile,
    openRecent,
    importFile,
    pickImageFolder,
    clearImageFolder,
    requestClose,
    resolveClosing,
    /** The tab waiting for the save/discard/cancel answer, if any. */
    closingTab: closing ? findTab(workspace.ws, closing) : undefined,
    importReport,
    dismissImportReport,
  };
}

export type DocumentActions = ReturnType<typeof useDocumentActions>;

/** Ctrl/Cmd+S saves the active document; with Shift it is "save as". */
export function useSaveShortcut(save: (saveAs: boolean) => Promise<boolean>, isBusy: () => boolean) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "s") return;
      e.preventDefault();
      if (!isBusy()) void save(e.shiftKey);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, isBusy]);
}
