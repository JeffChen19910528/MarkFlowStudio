import { t } from "../../i18n";
import { AlignmentType, BorderStyle, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { parseMarkdown } from "../../markdown/render";

import { inlineRuns } from "./inline";
import { type Ctx, HEADINGS, LIST_INDENT, MAX_LIST_LEVELS, MONO, QUOTE_INDENT, hex } from "./context";

function blockProps(ctx: Ctx, isMarkerParagraph: boolean) {
  const depth = ctx.lists.length;
  const list = ctx.lists[depth - 1];
  const quoteIndent = ctx.quote * QUOTE_INDENT;
  const props: Record<string, unknown> = {};
  if (depth > 0 && isMarkerParagraph && list) {
    props.numbering = {
      reference: list.ordered ? "ordered" : "bullets",
      level: Math.min(depth - 1, MAX_LIST_LEVELS - 1),
      instance: list.instance,
    };
    if (quoteIndent) props.indent = { left: (depth * LIST_INDENT) + quoteIndent, hanging: 360 };
  } else if (depth > 0) {
    props.indent = { left: depth * LIST_INDENT + quoteIndent };
  } else if (quoteIndent) {
    props.indent = { left: quoteIndent };
  }
  if (ctx.quote > 0) {
    props.border = { left: { style: BorderStyle.SINGLE, size: 12, color: "999999", space: 8 } };
  }
  return props;
}

export function buildChildren(source: string, ctx: Ctx): (Paragraph | Table)[] {
  const tokens = parseMarkdown(source);
  const out: (Paragraph | Table)[] = [];
  let rows: TableRow[] = [];
  let cells: TableCell[] = [];
  let headerRow = false;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    switch (tok.type) {
      case "heading_open": {
        const level = Math.min(6, Math.max(1, Number(tok.tag.slice(1)) || 1));
        out.push(new Paragraph({ heading: HEADINGS[level - 1], children: inlineRuns(tokens[i + 1].children, ctx) }));
        break;
      }
      case "paragraph_open": {
        const marker = ctx.itemFirst && ctx.lists.length > 0;
        if (marker) ctx.itemFirst = false;
        out.push(new Paragraph({ children: inlineRuns(tokens[i + 1].children, ctx), ...blockProps(ctx, marker) }));
        break;
      }
      case "fence":
      case "code_block": {
        const lines = tok.content.replace(/\n$/, "").split("\n");
        lines.forEach((line, n) =>
          out.push(
            new Paragraph({
              spacing: { after: n === lines.length - 1 ? ctx.halfPoints * 8 : 0, line: 260 },
              shading: { type: ShadingType.CLEAR, fill: hex(ctx.colors.code), color: "auto" },
              indent: ctx.lists.length ? { left: ctx.lists.length * LIST_INDENT } : undefined,
              children: [new TextRun({ text: line, font: MONO, size: Math.round(ctx.halfPoints * 0.9) })],
            }),
          ),
        );
        break;
      }
      case "hr":
        out.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "999999", space: 1 } } }));
        break;
      case "blockquote_open":
        ctx.quote++;
        break;
      case "blockquote_close":
        ctx.quote--;
        break;
      case "bullet_list_open":
        ctx.lists.push({ ordered: false, instance: 0 });
        break;
      case "ordered_list_open": {
        if (Number(tok.attrGet("start") ?? 1) !== 1) {
          ctx.warnings.add(t("docx.warnListStart"));
        }
        ctx.lists.push({ ordered: true, instance: ++ctx.orderedInstances });
        break;
      }
      case "bullet_list_close":
      case "ordered_list_close":
        ctx.lists.pop();
        break;
      case "list_item_open":
        ctx.itemFirst = true;
        break;
      case "list_item_close":
        ctx.itemFirst = false;
        break;
      case "table_open":
        rows = [];
        break;
      case "tr_open":
        cells = [];
        headerRow = false;
        break;
      case "th_open":
      case "td_open": {
        const th = tok.type === "th_open";
        if (th) headerRow = true;
        const align = /text-align:\s*(center|right)/.exec(String(tok.attrGet("style") ?? ""))?.[1];
        cells.push(
          new TableCell({
            shading: th ? { type: ShadingType.CLEAR, fill: hex(ctx.colors.code), color: "auto" } : undefined,
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            children: [
              new Paragraph({
                alignment: align === "center" ? AlignmentType.CENTER : align === "right" ? AlignmentType.RIGHT : undefined,
                children: inlineRuns(tokens[i + 1].children, ctx, th ? { bold: true } : {}),
              }),
            ],
          }),
        );
        break;
      }
      case "tr_close":
        rows.push(new TableRow({ tableHeader: headerRow, cantSplit: true, children: cells }));
        break;
      case "table_close":
        out.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
        out.push(new Paragraph({ spacing: { after: ctx.halfPoints * 4 } }));
        break;
    }
  }
  return out;
}
