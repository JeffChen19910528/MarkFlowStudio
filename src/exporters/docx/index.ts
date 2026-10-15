import { t as tr } from "../../i18n";
import { Document, Packer } from "docx";
import { resolveExportTheme } from "../html";
import type { BinaryOutput, ExportInput } from "../types";

import { buildChildren } from "./blocks";
import { type Ctx, FONTS, HEADINGS, PX_TO_HALF_POINTS, PX_TO_TWIPS, hex } from "./context";
import { numberingConfig, validateDocx } from "./package";

export { validateDocx };

export async function exportDocx({ markdown, title, theme, style, images }: ExportInput): Promise<BinaryOutput> {
  const t = resolveExportTheme(theme, style);
  const halfPoints = Math.round(t.fontSizePx * PX_TO_HALF_POINTS);
  const ctx: Ctx = {
    warnings: new Set(),
    skippedImages: 0,
    unsupportedFormat: 0,
    embeddedImages: 0,
    imageMap: images ?? new Map(),
    colors: { text: t.textColor, link: t.linkColor, code: t.codeBackground, heading: t.headingColor },
    halfPoints,
    lists: [],
    orderedInstances: 0,
    itemFirst: false,
    quote: 0,
  };

  const children = buildChildren(markdown, ctx);
  if (children.length === 0) throw new Error(tr("docx.emptyOutput"));
  if (ctx.skippedImages > 0) {
    ctx.warnings.add(tr("docx.warnImages", { n: ctx.skippedImages }));
  }
  if (ctx.unsupportedFormat > 0) {
    ctx.warnings.add(tr("docx.warnWebp", { n: ctx.unsupportedFormat }));
  }
  if (style === "follow" && t.previewBackground.toLowerCase() !== "#ffffff") {
    ctx.warnings.add(tr("docx.warnBackground"));
  }

  const font = FONTS[t.fontFamily];
  const headingStyles = HEADINGS.map((_, i) => ({
    id: `Heading${i + 1}`,
    name: `heading ${i + 1}`,
    basedOn: "Normal",
    next: "Normal",
    quickFormat: true,
    run: { bold: true, color: hex(t.headingColor), size: Math.round(halfPoints * t.headingScales[i]) },
    paragraph: { spacing: { before: halfPoints * 8, after: halfPoints * 4 }, keepNext: true },
  }));

  const doc = new Document({
    title: title.replace(/\.(md|markdown|txt|docx)$/i, "") || tr("doc.untitled"),
    creator: "MarkFlow Studio",
    numbering: numberingConfig(),
    styles: {
      default: {
        document: {
          run: { font, size: halfPoints, color: hex(t.textColor) },
          paragraph: {
            spacing: { after: t.paragraphSpacingPx * PX_TO_TWIPS, line: Math.round(t.lineHeight * 240) },
          },
        },
      },
      paragraphStyles: headingStyles,
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4
            margin: { top: 1417, right: 1417, bottom: 1417, left: 1417 },
          },
        },
        children,
      },
    ],
  });

  const data = new Uint8Array(await Packer.toArrayBuffer(doc));
  await validateDocx(data);
  return { data, warnings: [...ctx.warnings] };
}
