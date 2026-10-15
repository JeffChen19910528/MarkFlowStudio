import { isUntitledTitle, t } from "../i18n";
import { type DocumentState, isDirty, newDocument, untitledName } from "./document";
import type { FileRef, FolderRef } from "./fileRef";

export interface Tab {
  /** `doc.id` doubles as the tab id. */
  doc: DocumentState;
  /** Writable file the document is linked to (File System Access API); absent for unsaved/compat-mode documents. */
  handle?: FileRef;
  autoSavedAt?: string;
  /** Folder the user granted for resolving this document's relative image paths. Not persisted. */
  imageFolder?: FolderRef;
}

export interface Workspace {
  tabs: Tab[];
  activeId: string;
}

export const MAX_TABS = 20;

export function newWorkspace(): Workspace {
  const tab: Tab = { doc: newDocument() };
  return { tabs: [tab], activeId: tab.doc.id };
}

export const activeTab = (ws: Workspace): Tab => ws.tabs.find((t) => t.doc.id === ws.activeId) ?? ws.tabs[0];

export const findTab = (ws: Workspace, id: string): Tab | undefined => ws.tabs.find((t) => t.doc.id === id);

export const anyDirty = (ws: Workspace): boolean => ws.tabs.some((t) => isDirty(t.doc));


/** An untouched "Untitled" tab: opening something should reuse it rather than leave an empty tab behind. */
export const isPristine = (t: Tab): boolean =>
  !t.handle && !t.doc.hasFile && isUntitledTitle(t.doc.title) && t.doc.markdown === "" && t.doc.savedMarkdown === "";

/** "Untitled.md", then "Untitled 2.md", "Untitled 3.md"… so several unsaved documents can be told apart. */
export function nextUntitledTitle(ws: Workspace): string {
  const taken = new Set(ws.tabs.map((tab) => tab.doc.title));
  if (!taken.has(untitledName())) return untitledName();
  for (let n = 2; ; n++) {
    const title = t("doc.untitledNumbered", { n });
    if (!taken.has(title)) return title;
  }
}

/**
 * After a language change, give unsaved documents that still carry the default name ("未命名 2.md") the
 * default name of the new language ("Untitled 2.md"). Saved or opened documents keep their file names.
 * Names stay unique; returns the same workspace when nothing needs renaming.
 */
export function relocalizeUntitled(ws: Workspace): Workspace {
  const renamable = (tab: Tab) => !tab.handle && !tab.doc.hasFile && isUntitledTitle(tab.doc.title);
  if (!ws.tabs.some(renamable)) return ws;
  const taken = new Set(ws.tabs.filter((tab) => !renamable(tab)).map((tab) => tab.doc.title));
  let changed = false;
  const tabs = ws.tabs.map((tab) => {
    if (!renamable(tab)) return tab;
    let title = untitledName();
    for (let n = 2; taken.has(title); n++) title = t("doc.untitledNumbered", { n });
    taken.add(title);
    if (title === tab.doc.title) return tab;
    changed = true;
    return { ...tab, doc: { ...tab.doc, title } };
  });
  return changed ? { ...ws, tabs } : ws;
}

export const canAddTab = (ws: Workspace): boolean => ws.tabs.length < MAX_TABS || isPristine(activeTab(ws));

/** Add `tab` and activate it, replacing the active tab when that one is pristine. No-op at the tab limit. */
export function openTab(ws: Workspace, tab: Tab): Workspace {
  const current = activeTab(ws);
  if (isPristine(current)) {
    return { tabs: ws.tabs.map((t) => (t === current ? tab : t)), activeId: tab.doc.id };
  }
  if (ws.tabs.length >= MAX_TABS) return ws;
  return { tabs: [...ws.tabs, tab], activeId: tab.doc.id };
}

export const activate = (ws: Workspace, id: string): Workspace =>
  findTab(ws, id) ? { ...ws, activeId: id } : ws;

/** Remove a tab. Closing the last one leaves a fresh empty document; closing the active one activates a neighbour. */
export function closeTab(ws: Workspace, id: string): Workspace {
  const index = ws.tabs.findIndex((t) => t.doc.id === id);
  if (index < 0) return ws;
  const tabs = ws.tabs.filter((t) => t.doc.id !== id);
  if (tabs.length === 0) return newWorkspace();
  if (ws.activeId !== id) return { ...ws, tabs };
  return { tabs, activeId: tabs[Math.min(index, tabs.length - 1)].doc.id };
}

export const updateTab = (ws: Workspace, id: string, fn: (t: Tab) => Tab): Workspace => ({
  ...ws,
  tabs: ws.tabs.map((t) => (t.doc.id === id ? fn(t) : t)),
});

/** Find an already-open tab linked to the same file, so opening a file twice never creates a divergent copy. */
export async function findTabByHandle(ws: Workspace, handle: FileRef): Promise<Tab | undefined> {
  for (const t of ws.tabs) {
    if (t.handle && (await t.handle.isSameEntry(handle).catch(() => false))) return t;
  }
  return undefined;
}
