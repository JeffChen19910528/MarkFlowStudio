import { t } from "../i18n";
import { inertBody } from "../shared/inertDom";
import { buildHtmlDocument } from "./html";
import {
  DEFAULT_PDF_OPTIONS,
  type PdfOptions,
  pageDimensionsMm,
  pdfOptionsError,
  sanitizePdfOptions,
  supportsPageMarginBoxes,
} from "./pdfOptions";
import type { ExportInput, ExportOutput, Exporter } from "./types";

/** Escape text for use inside a CSS string, so user text can never close the string or the rule. */
export function cssString(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (ch === "\\" || ch === '"') out += "\\" + ch;
    else if (code < 32 || ch === "<" || ch === ">" || ch === "&") out += "\\" + code.toString(16) + " ";
    else out += ch;
  }
  return `"${out}"`;
}

const mm = (n: number) => `${Number(n.toFixed(2))}mm`;

/** Remove anchors but keep their content. */
function stripLinks(html: string): string {
  const box = inertBody(html);
  box.querySelectorAll("a").forEach((a) => a.replaceWith(...Array.from(a.childNodes)));
  return box.innerHTML;
}

/**
 * The print document cannot load relative or remote images (it inherits the app's CSP, and a PDF
 * has no source folder), so they would print as broken-image icons. Replace them with their alt text.
 */
function replaceUnprintableImages(html: string, onReplaced: (n: number) => void): string {
  const box = inertBody(html);
  let count = 0;
  box.querySelectorAll("img").forEach((img) => {
    if (/^data:image\//i.test(img.getAttribute("src") ?? "")) return;
    const span = document.createElement("span");
    span.className = "img-missing";
    span.textContent = t("common.imageAlt", { alt: img.getAttribute("alt") || t("doc.untitled") });
    img.replaceWith(span);
    count++;
  });
  onReplaced(count);
  return box.innerHTML;
}

export function printCss(o: PdfOptions): string {
  const { width, height } = pageDimensionsMm(o);
  const { top, right, bottom, left } = o.marginsMm;
  const boxes: string[] = [];
  const box = (name: string, content: string) =>
    boxes.push(`@${name}{content:${content};font-size:9pt;color:#555;font-family:var(--content-font)}`);
  if (o.headerText) box("top-center", cssString(o.headerText));
  if (o.footerText) box("bottom-left", cssString(o.footerText));
  if (o.pageNumbers) box("bottom-right", `counter(page) " / " counter(pages)`);

  const maxImageHeight = Math.max(20, height - top - bottom - 5);

  const background = o.includeBackground
    ? `html,body{background:var(--preview-bg)}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}`
    : `html,body{background:#fff !important}
.markdown-body *{background:transparent !important}
.markdown-body pre{border:1px solid #bbb}`;

  return `@page{size:${mm(width)} ${mm(height)};margin:${mm(top)} ${mm(right)} ${mm(bottom)} ${mm(left)};${boxes.join("")}}
@media screen{
html{background:#d8dadf}
body{box-sizing:content-box;width:${mm(width - left - right)};min-height:${mm(height - top - bottom)};margin:16px auto;padding:${mm(top)} ${mm(right)} ${mm(bottom)} ${mm(left)};background:${o.includeBackground ? "var(--preview-bg)" : "#fff"};box-shadow:0 1px 8px rgba(0,0,0,.35)}
}
@media print{
${background}
body{margin:0;padding:0;width:auto;min-height:0;box-shadow:none}
.markdown-body{max-width:none}
.markdown-body h1,.markdown-body h2,.markdown-body h3,.markdown-body h4,.markdown-body h5,.markdown-body h6{break-after:avoid-page}
.markdown-body p,.markdown-body li{orphans:3;widows:3}
.markdown-body table{display:table;width:100%;overflow:visible;overflow-wrap:anywhere}
.markdown-body thead{display:table-header-group}
.markdown-body tr,.markdown-body img,.markdown-body blockquote{break-inside:avoid-page}
.markdown-body img{max-width:100%;max-height:${mm(maxImageHeight)};object-fit:contain}
.markdown-body pre{overflow:visible;${o.wrapCode ? "white-space:pre-wrap;overflow-wrap:anywhere" : ""}}
}`;
}

export function buildPrintDocument(input: ExportInput, raw?: PdfOptions): ExportOutput {
  const o = sanitizePdfOptions(raw ?? input.pdf ?? DEFAULT_PDF_OPTIONS);
  const problem = pdfOptionsError(o);
  if (problem) throw new Error(problem);

  let replacedImages = 0;
  const out = buildHtmlDocument(input, {
    css: `${printCss(o)}\n.img-missing{font-style:italic;color:#666}`,
    mapBody: (html) => {
      const withoutImages = replaceUnprintableImages(html, (n) => (replacedImages = n));
      return o.keepLinks ? withoutImages : stripLinks(withoutImages);
    },
    title: input.title.replace(/\.(md|markdown|txt|pdf)$/i, "").trim() || t("doc.untitled"),
    skipImageWarnings: true,
  });

  const warnings = [...out.warnings];
  if (replacedImages > 0) warnings.push(t("pdf.warnImages", { n: replacedImages }));
  if ((o.pageNumbers || o.headerText || o.footerText) && !supportsPageMarginBoxes()) {
    warnings.push(t("pdf.warnPageNumbers"));
  }
  warnings.push(t("pdf.warnPreview"));
  return { content: out.content, warnings };
}

export const pdfExporter: Exporter = {
  format: "pdf",
  get label() {
    return t("export.label.pdf");
  },
  extension: ".pdf",
  mime: "application/pdf",
  usesStyle: true,
  export: (input) => buildPrintDocument(input),
};
