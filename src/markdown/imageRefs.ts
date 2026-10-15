import { isLocalImageSrc } from "../images";
import { parseMarkdown } from "./render";

/** `src` attributes of local images in a Markdown document, as they appear in the rendered output. */
export function localImageSrcs(markdown: string): string[] {
  const out = new Set<string>();
  for (const t of parseMarkdown(markdown)) {
    for (const c of t.children ?? []) {
      if (c.type !== "image") continue;
      const src = String(c.attrGet("src") ?? "");
      if (isLocalImageSrc(src)) out.add(src);
    }
  }
  return [...out];
}
