import { t } from "../../i18n";
import { ImageRun, ExternalHyperlink, type ParagraphChild, ShadingType, TextRun } from "docx";
import type { Token } from "markdown-it";

import { type Ctx, DOCX_IMAGE_TYPES, MONO, type RunStyle, fitImage, hex } from "./context";

export function inlineRuns(children: Token[] | null, ctx: Ctx, base: RunStyle = {}): ParagraphChild[] {
  const out: ParagraphChild[] = [];
  const style = { ...base };
  let link: { href: string; runs: ParagraphChild[] } | null = null;
  const push = (r: ParagraphChild) => (link ? link.runs : out).push(r);
  const text = (t: string, extra: object = {}) =>
    new TextRun({
      text: t,
      bold: style.bold,
      italics: style.italics,
      strike: style.strike,
      ...(link ? { color: hex(ctx.colors.link), underline: {} } : {}),
      ...extra,
    });

  for (const c of children ?? []) {
    switch (c.type) {
      case "text":
        push(text(c.content));
        break;
      case "code_inline":
        push(
          text(c.content, {
            font: MONO,
            shading: { type: ShadingType.CLEAR, fill: hex(ctx.colors.code), color: "auto" },
          }),
        );
        break;
      case "softbreak":
        push(text(" "));
        break;
      case "hardbreak":
        push(new TextRun({ break: 1 }));
        break;
      case "image": {
        const alt = c.content || t("doc.untitled");
        const found = ctx.imageMap.get(String(c.attrGet("src") ?? ""));
        const type = found ? DOCX_IMAGE_TYPES[found.mime] : undefined;
        if (found && type) {
          const { width, height } = fitImage(found.width, found.height);
          push(
            new ImageRun({
              type,
              data: found.bytes,
              transformation: { width, height },
              altText: { name: alt, description: alt, title: alt },
            }),
          );
          ctx.embeddedImages++;
        } else {
          if (found) ctx.unsupportedFormat++;
          else ctx.skippedImages++;
          push(text(t("common.imageAlt", { alt }), { italics: true }));
        }
        break;
      }
      case "strong_open":
        style.bold = true;
        break;
      case "strong_close":
        style.bold = base.bold;
        break;
      case "em_open":
        style.italics = true;
        break;
      case "em_close":
        style.italics = base.italics;
        break;
      case "s_open":
        style.strike = true;
        break;
      case "s_close":
        style.strike = base.strike;
        break;
      case "link_open": {
        const href = String(c.attrGet("href") ?? "");
        if (/^(https?:|mailto:)/i.test(href)) link = { href, runs: [] };
        break;
      }
      case "link_close":
        if (link) {
          out.push(new ExternalHyperlink({ link: link.href, children: link.runs as TextRun[] }));
          link = null;
        }
        break;
    }
  }
  return out;
}
