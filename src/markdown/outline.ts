import { parseMarkdown } from "./render";

export interface OutlineItem {
  level: number;
  text: string;
  /** 0-based source line of the heading. */
  line: number;
  /** Index among all headings, so the preview can find the same one. */
  index: number;
}

export function buildOutline(markdown: string): OutlineItem[] {
  const tokens = parseMarkdown(markdown);
  const items: OutlineItem[] = [];
  tokens.forEach((t, i) => {
    if (t.type !== "heading_open" || !t.map) return;
    const text = tokens[i + 1]?.children?.map((c) => (c.type === "text" || c.type === "code_inline" ? c.content : "")).join("") ?? "";
    items.push({ level: Number(t.tag.slice(1)), text: text.trim(), line: t.map[0], index: items.length });
  });
  return items;
}
