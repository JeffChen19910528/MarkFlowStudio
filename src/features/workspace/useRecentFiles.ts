import { useCallback, useEffect, useState } from "react";
import type { RecentFile, RecentStore } from "../../platform/types";
import type { FileRef } from "../../shared/fileRef";

/** The recent-files list backed by a RecentStore. Does nothing where the store is unsupported. */
export function useRecentFiles(store: RecentStore) {
  const [recents, setRecents] = useState<RecentFile[]>([]);
  const supported = store.supported;

  useEffect(() => {
    if (supported) void store.list().then(setRecents);
  }, [store, supported]);

  const record = useCallback(
    async (ref: FileRef) => {
      if (!store.supported) return;
      await store.add(ref);
      setRecents(await store.list());
    },
    [store],
  );

  /** Drop one entry (e.g. its file no longer exists). */
  const forget = useCallback(
    async (id: string) => {
      await store.remove(id);
      setRecents(await store.list());
    },
    [store],
  );

  const clear = useCallback(async () => {
    await store.clear();
    setRecents([]);
  }, [store]);

  return { recents, supported, record, forget, clear };
}

export type RecentFilesApi = ReturnType<typeof useRecentFiles>;
