import type { RecentFile } from "../shared/files";
import type { FileRef } from "../shared/fileRef";

/**
 * Recently opened files, kept in IndexedDB.
 *
 * Browsers do not expose file paths, so we keep the file's name, the time it was last opened, and the
 * FileRef (which IndexedDB can store). No document content is stored. Every operation
 * swallows storage errors (private windows, blocked storage) and degrades to "no recent files".
 */
export const MAX_RECENT = 10;
const DB_NAME = "markflow-studio";
const STORE = "recent-files";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, mode);
    const result = await fn(tx.objectStore(STORE));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return result;
  } finally {
    db.close();
  }
}

const isRecent = (v: unknown): v is RecentFile => {
  const r = v as Partial<RecentFile> | null;
  return !!r && typeof r.id === "string" && typeof r.name === "string" && typeof r.openedAt === "number" && !!r.handle;
};

/** Newest first. Malformed rows are ignored. */
export async function listRecent(): Promise<RecentFile[]> {
  try {
    const rows = await withStore("readonly", (s) => done(s.getAll()));
    return rows.filter(isRecent).sort((a, b) => b.openedAt - a.openedAt);
  } catch {
    return [];
  }
}

export interface AddRecentOptions {
  now?: number;
  /** Same-file check; defaults to the handle's own `isSameEntry`. Injectable so tests can use plain data. */
  isSame?: (a: FileRef, b: FileRef) => Promise<boolean>;
}

const defaultIsSame = (a: FileRef, b: FileRef) => a.isSameEntry(b).catch(() => false);

/** Record that `handle` was opened/saved. Moves an existing entry for the same file to the top. */
export async function addRecent(handle: FileRef, opts: AddRecentOptions = {}): Promise<void> {
  const { now = Date.now(), isSame = defaultIsSame } = opts;
  try {
    const existing = await listRecent();
    let id: string | undefined;
    for (const r of existing) {
      if (await isSame(r.handle, handle)) {
        id = r.id;
        break;
      }
    }
    const entry: RecentFile = { id: id ?? crypto.randomUUID(), name: handle.name, openedAt: now, handle };
    const overflow = id ? [] : existing.slice(MAX_RECENT - 1); // oldest entries beyond the cap
    await withStore("readwrite", async (s) => {
      await done(s.put(entry));
      for (const r of overflow) await done(s.delete(r.id));
    });
  } catch {
    /* recent files are a convenience; never fail the user's action */
  }
}

export async function removeRecent(id: string): Promise<void> {
  try {
    await withStore("readwrite", (s) => done(s.delete(id)));
  } catch {
    /* ignore */
  }
}

export async function clearRecent(): Promise<void> {
  try {
    await withStore("readwrite", (s) => done(s.clear()));
  } catch {
    /* ignore */
  }
}
