import type { Token } from "markdown-it";
import { t } from "../i18n";
import { parseMarkdown } from "../markdown/render";
import type { ExportOutput, Exporter } from "./types";

interface Ctx {
  lines: string[];
  warnings: Set<string>;
  quote: number;
  /** Marker widths of the enclosing list items, outermost first. */
  indents: number[];
  marker: string | null;
  lists: { ordered: boolean; n: number }[];
  row: string[] | null;
}

function inlineText(children: Token[] | null, ctx: Ctx): string {
  let out = "";
  let href: string | null = null;
  let linkStart = 0;
  for (const c of children ?? []) {
    switch (c.type) {
      case "text":
      case "code_inline":
        out += c.content;
        break;
      case "softbreak":
      case "hardbreak":
        out += "\n";
        break;
      case "image":
        out += c.content;
        ctx.warnings.add(t("txt.warnImages"));
        break;
      case "link_open":
        href = String(c.attrGet("href") ?? "") || null;
        linkStart = out.length;
        break;
      case "link_close":
        if (href && /^(https?:|mailto:)/i.test(href) && out.slice(linkStart) !== href) out += ` (${href})`;
        href = null;
        break;
    }
  }
  return out;
}

function emit(ctx: Ctx, text: string): void {
  const base = "> ".repeat(ctx.quote);
  const total = ctx.indents.reduce((a, b) => a + b, 0);
  text.split("\n").forEach((line, i) => {
    let prefix: string;
    if (i === 0 && ctx.marker) {
      prefix = " ".repeat(total - ctx.marker.length) + ctx.marker;
      ctx.marker = null;
    } else {
      prefix = " ".repeat(total);
    }
    ctx.lines.push(line === "" && !prefix.trim() && !base ? "" : base + prefix + line);
  });
}

const blank = (ctx: Ctx) => ctx.lines.push("");

/** Convert Markdown to readable plain text via the same parser the preview uses. */
export function markdownToText(source: string): ExportOutput {
  const ctx: Ctx = { lines: [], warnings: new Set(), quote: 0, indents: [], marker: null, lists: [], row: null };

  for (const tok of parseMarkdown(source)) {
    switch (tok.type) {
      case "heading_open":
      case "paragraph_open":
        break;
      case "inline": {
        const text = inlineText(tok.children, ctx);
        if (ctx.row) ctx.row.push(text.replace(/\n/g, " "));
        else emit(ctx, text);
        break;
      }
      case "paragraph_close":
        if (!tok.hidden) blank(ctx);
        break;
      case "heading_close":
        blank(ctx);
        break;
      case "fence":
      case "code_block":
        emit(ctx, tok.content.replace(/\n$/, ""));
        blank(ctx);
        break;
      case "hr":
        emit(ctx, "----------");
        blank(ctx);
        break;
      case "blockquote_open":
        ctx.quote++;
        break;
      case "blockquote_close":
        ctx.quote--;
        break;
      case "bullet_list_open":
        ctx.lists.push({ ordered: false, n: 0 });
        break;
      case "ordered_list_open":
        ctx.lists.push({ ordered: true, n: Number(tok.attrGet("start") ?? 1) });
        break;
      case "bullet_list_close":
      case "ordered_list_close":
        ctx.lists.pop();
        if (ctx.lists.length === 0) blank(ctx);
        break;
      case "list_item_open": {
        const list = ctx.lists[ctx.lists.length - 1];
        ctx.marker = list.ordered ? `${list.n++}. ` : "- ";
        ctx.indents.push(ctx.marker.length);
        break;
      }
      case "list_item_close":
        ctx.indents.pop();
        ctx.marker = null;
        break;
      case "table_open":
        ctx.warnings.add(t("txt.warnTables"));
        break;
      case "tr_open":
        ctx.row = [];
        break;
      case "tr_close":
        emit(ctx, ctx.row!.join(" | "));
        ctx.row = null;
        break;
      case "table_close":
        blank(ctx);
        break;
    }
  }

  const content = ctx.lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { content: content === "" ? "" : content + "\n", warnings: [...ctx.warnings] };
}

export const txtExporter: Exporter = {
  format: "txt",
  get label() {
    return t("export.label.txt");
  },
  extension: ".txt",
  mime: "text/plain",
  usesStyle: false,
  export: ({ markdown }) => markdownToText(markdown),
};
