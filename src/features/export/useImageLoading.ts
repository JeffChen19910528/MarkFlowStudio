import { useEffect, useMemo, useState } from "react";
import { type ImageLoadResult, resolveImages } from "../../images";
import { localImageSrcs } from "../../markdown/imageRefs";
import type { FolderRef } from "../../shared/fileRef";

/**
 * Read the document's relative-path images from the user-granted folder, so exporters can embed them.
 * `enabled` is false for formats that never use images (plain text), which then never touch the folder.
 */
export function useImageLoading(markdown: string, folder: FolderRef | undefined, enabled: boolean) {
  const srcs = useMemo(() => (enabled ? localImageSrcs(markdown) : []), [enabled, markdown]);
  const needsImages = folder !== undefined && srcs.length > 0;
  const [loaded, setLoaded] = useState<{ markdown: string; folder: FolderRef; result: ImageLoadResult } | null>(null);

  useEffect(() => {
    if (!folder || srcs.length === 0) return;
    let cancelled = false;
    void resolveImages(folder, srcs).then((result) => {
      if (!cancelled) setLoaded({ markdown, folder, result });
    });
    return () => {
      cancelled = true;
    };
  }, [folder, srcs, markdown]);

  /** False while the images for the *current* text and folder are still being read. */
  const ready = !needsImages || (loaded?.markdown === markdown && loaded?.folder === folder);
  return {
    needsImages,
    ready,
    images: needsImages && ready ? loaded!.result.images : undefined,
    failures: needsImages && ready ? loaded!.result.failures : [],
  };
}
