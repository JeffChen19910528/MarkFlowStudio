import { useDeferredValue, useMemo, useRef } from "react";
import { t } from "../i18n";
import { useLanguage } from "../i18n/react";
import { isLocalImageSrc } from "../images";
import { renderMarkdown } from "../markdown/render";
import type { FolderRef } from "../shared/fileRef";
import { inertBody } from "../shared/inertDom";
import { useLocalImages } from "./useLocalImages";

interface PreviewProps {
  markdown: string;
  onElement: (el: HTMLDivElement | null) => void;
  /** Folder the user granted for resolving relative image paths. */
  imageFolder?: FolderRef;
  /** Bump to re-read images from disk. */
  imageReload?: number;
}

/**
 * Before the HTML reaches the page, take `src` off every image so the browser never starts a request on
 * its own: local images are filled in later from the granted folder; remote images are blocked.
 */
export function prepareImages(html: string): string {
  if (!html.includes("<img")) return html;
  const body = inertBody(html);
  body.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src") ?? "";
    if (isLocalImageSrc(src)) {
      img.setAttribute("data-local-src", src);
      img.removeAttribute("src");
    } else if (/^https?:/i.test(src)) {
      img.setAttribute("data-blocked-src", src);
      img.removeAttribute("src");
      img.classList.add("img-blocked");
      img.setAttribute("title", t("preview.externalImage"));
    }
  });
  return body.innerHTML;
}

export function Preview({ markdown, onElement, imageFolder, imageReload = 0 }: PreviewProps) {
  const deferred = useDeferredValue(markdown);
  const language = useLanguage();
  // `language` is a dependency because prepareImages writes translated tooltips into the HTML.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => prepareImages(renderMarkdown(deferred)), [deferred, language]);
  const article = useRef<HTMLElement>(null);
  useLocalImages(article, html, imageFolder, imageReload);

  return (
    <div className="preview" ref={onElement} aria-label={t("preview.label")} role="region">
      {deferred.trim() === "" ? (
        <p className="preview-empty">{t("preview.empty")}</p>
      ) : (
        <article className="markdown-body" ref={article} dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </div>
  );
}
