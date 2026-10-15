import { htmlLang, t } from "../i18n";
import { type ResolvedImage, toDataUri } from "../images";
import { renderMarkdown } from "../markdown/render";
import { inertBody } from "../shared/inertDom";
import bodyCss from "../markdown/markdown-body.css?raw";
import { DEFAULT_THEME, type ThemeSettings, themeToCssVars } from "../themes/themes";
import type { ExportInput, ExportOutput, Exporter } from "./types";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Theme used for the exported document, independent of the editor look when style = "print". */
export function resolveExportTheme(theme: ThemeSettings, style: ExportInput["style"]): ThemeSettings {
  if (style === "follow") return theme;
  const { editorBackground, previewBackground, textColor, headingColor, linkColor, codeBackground } = DEFAULT_THEME;
  return { ...theme, editorBackground, previewBackground, textColor, headingColor, linkColor, codeBackground };
}

function documentTitle(markdown: string, fallback: string): string {
  const h1 = /^#[ \t]+(.+?)[ \t#]*$/m.exec(markdown)?.[1];
  return (h1 ?? fallback.replace(/\.(md|markdown|txt)$/i, "")).trim() || t("doc.untitled");
}

function collectWarnings(renderedHtml: string): string[] {
  const warnings: string[] = [];
  const box = inertBody(renderedHtml);
  const srcs = [...box.querySelectorAll("img")].map((i) => i.getAttribute("src") ?? "");
  const local = srcs.filter((s) => !/^(https:|data:image\/)/i.test(s)).length;
  const remote = srcs.filter((s) => /^https:/i.test(s)).length;
  if (local > 0) {
    warnings.push(t("html.warnLocalImages", { n: local }));
  }
  if (remote > 0) warnings.push(t("html.warnRemoteImages", { n: remote }));
  return warnings;
}

export interface DocumentExtras {
  /** Appended after the shared stylesheet, so it can override it. */
  css?: string;
  /** Post-process the sanitised body HTML (e.g. strip links). Must not add active content. */
  mapBody?: (html: string) => string;
  /** Use this as <title> instead of deriving it from the first H1. */
  title?: string;
  /** The caller reports image handling itself (the default warnings describe HTML-file behaviour). */
  skipImageWarnings?: boolean;
}

/** Replace `src` of images we have the bytes for with a self-contained data URI. */
export function embedImages(html: string, images: ReadonlyMap<string, ResolvedImage> | undefined): string {
  if (!images || images.size === 0) return html;
  const box = inertBody(html);
  const uris = new Map<string, string>();
  box.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src") ?? "";
    const found = images.get(src);
    if (!found) return;
    if (!uris.has(src)) uris.set(src, toDataUri(found));
    img.setAttribute("src", uris.get(src)!);
    img.setAttribute("width", String(found.width));
    img.setAttribute("height", String(found.height));
  });
  return box.innerHTML;
}

export const exportHtml = (input: ExportInput): ExportOutput => buildHtmlDocument(input);

export function buildHtmlDocument(
  { markdown, title, theme, style, images }: ExportInput,
  extras: DocumentExtras = {},
): ExportOutput {
  const t = resolveExportTheme(theme, style);
  const rendered = embedImages(renderMarkdown(markdown), images);
  const body = extras.mapBody ? extras.mapBody(rendered) : rendered;
  const vars = Object.entries(themeToCssVars(t))
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
  const css = `:root{${vars}}
html{background:var(--preview-bg)}
body{margin:0;padding:24px 32px;background:var(--preview-bg);color:var(--text);font-family:var(--content-font);font-size:var(--font-size);line-height:var(--line-height)}
${bodyCss}
@media print{body{padding:0}}
${extras.css ?? ""}`;
  const heading = extras.title ?? documentTitle(markdown, title);
  const content = `<!doctype html>
<html lang="${htmlLang()}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'">
<meta name="generator" content="MarkFlow Studio">
<title>${escapeHtml(heading)}</title>
<style>
${css}
</style>
</head>
<body>
<article class="markdown-body">
${body}
</article>
</body>
</html>
`;
  return { content, warnings: extras.skipImageWarnings ? [] : collectWarnings(rendered) };
}

export const htmlExporter: Exporter = {
  format: "html",
  get label() {
    return t("export.label.html");
  },
  extension: ".html",
  mime: "text/html",
  usesStyle: true,
  export: exportHtml,
};
