import { type RefObject, useEffect, useRef } from "react";
import { t } from "../i18n";
import { describeImageError, resolveImage } from "../images";
import type { FolderRef } from "../shared/fileRef";

const markMissing = (img: HTMLImageElement, why: string) => {
  img.removeAttribute("src");
  img.classList.add("img-unresolved");
  img.setAttribute("title", why);
};

/**
 * Fill in the `<img data-local-src>` elements inside `root` from the user-granted folder, through blob
 * URLs. Images already read are cached until the folder changes or `reload` is bumped; every blob URL is
 * released when it is no longer needed. Images that cannot be shown get a marker and an explanation.
 */
export function useLocalImages(root: RefObject<HTMLElement | null>, html: string, folder: FolderRef | undefined, reload: number) {
  /** src → blob URL for images already read from the granted folder. */
  const urls = useRef(new Map<string, string>());

  // Drop cached blob URLs when the folder changes or a reload is requested.
  useEffect(() => {
    const cache = urls.current;
    return () => {
      cache.forEach((u) => URL.revokeObjectURL(u));
      cache.clear();
    };
  }, [folder, reload]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const imgs = [...el.querySelectorAll<HTMLImageElement>("img[data-local-src]")];
    if (imgs.length === 0) return;
    if (!folder) {
      imgs.forEach((i) => markMissing(i, t("preview.noImageFolder")));
      return;
    }
    let cancelled = false;
    void (async () => {
      for (const img of imgs) {
        const src = img.getAttribute("data-local-src")!;
        let url = urls.current.get(src);
        if (!url) {
          try {
            const r = await resolveImage(folder, src);
            if (cancelled) return;
            url = URL.createObjectURL(new Blob([r.bytes], { type: r.mime }));
            urls.current.set(src, url);
          } catch (e) {
            if (!cancelled) markMissing(img, describeImageError(e));
            continue;
          }
        }
        if (cancelled) return;
        img.classList.remove("img-unresolved");
        img.removeAttribute("title");
        img.src = url;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [root, html, folder, reload]);
}
