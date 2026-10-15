import { useCallback, useEffect, useRef, useState } from "react";
import type { EditorState } from "@codemirror/state";
import { subscribeLanguage } from "../../i18n";
import { newDocument, withEdit } from "../../shared/document";
import type { FolderRef } from "../../shared/fileRef";
import {
  type Tab,
  type Workspace,
  activate,
  activeTab,
  anyDirty,
  canAddTab,
  closeTab,
  newWorkspace,
  nextUntitledTitle,
  openTab,
  relocalizeUntitled,
  updateTab,
} from "../../shared/workspace";

/**
 * The open documents (tabs) and the operations on them. It knows nothing about files or the platform:
 * it only holds state. Asynchronous flows read the newest state through `latest()`, which stays correct
 * inside callbacks that outlive a render.
 */
export function useWorkspace() {
  const [ws, setWs] = useState<Workspace>(newWorkspace);
  const wsRef = useRef(ws);
  useEffect(() => {
    wsRef.current = ws;
  });
  // Unsaved "Untitled" tabs are renamed when the interface language changes.
  useEffect(() => subscribeLanguage(() => setWs(relocalizeUntitled)), []);
  /** Saved editor states (undo history, cursor) of open documents that are not currently shown. */
  const [editorStates] = useState(() => new Map<string, EditorState>());

  const latest = useCallback(() => wsRef.current, []);
  const canAdd = useCallback(() => canAddTab(wsRef.current), []);
  const activateTab = useCallback((id: string) => setWs((w) => activate(w, id)), []);
  const addTab = useCallback((tab: Tab) => setWs((w) => openTab(w, tab)), []);
  /** Add an empty document with the next free "未命名 N.md" name. */
  const addEmptyDocument = useCallback(
    () => setWs((w) => openTab(w, { doc: newDocument("", nextUntitledTitle(w)) })),
    [],
  );
  const updateById = useCallback((id: string, fn: (t: Tab) => Tab) => setWs((w) => updateTab(w, id, fn)), []);
  const editActive = useCallback(
    (markdown: string) => setWs((w) => updateTab(w, w.activeId, (t) => ({ ...t, doc: withEdit(t.doc, markdown) }))),
    [],
  );
  const setActiveImageFolder = useCallback(
    (folder: FolderRef | undefined) => setWs((w) => updateTab(w, w.activeId, (t) => ({ ...t, imageFolder: folder }))),
    [],
  );
  const closeNow = useCallback(
    (id: string) => {
      editorStates.delete(id);
      setWs((w) => closeTab(w, id));
    },
    [editorStates],
  );

  return {
    ws,
    active: activeTab(ws),
    anyUnsaved: anyDirty(ws),
    editorStates,
    latest,
    canAdd,
    activateTab,
    addTab,
    addEmptyDocument,
    updateById,
    editActive,
    setActiveImageFolder,
    closeNow,
  };
}

export type WorkspaceApi = ReturnType<typeof useWorkspace>;
