import DOMPurify from "dompurify";
import { t } from "../i18n";
import TurndownService from "turndown";

const DROPPED_TAGS = ["script", "style", "iframe", "object", "embed", "svg", "math", "video", "audio", "canvas", "form", "input", "button", "select", "textarea", "noscript"];

export interface HtmlConversion {
  markdown: string;
  warnings: string[];
}

/** Inspect the untrusted document (inert: parsed with DOMParser, never inserted into the page). */
function auditSource(doc: Document): { dropped: number; styled: boolean; merged: boolean; nested: boolean } {
  const dropped = doc.querySelectorAll(DROPPED_TAGS.join(",")).length;
  const styled = doc.querySelector("[style], font, [color], [bgcolor], [class*='color']") !== null;
  const merged = doc.querySelector("td[colspan], td[rowspan], th[colspan], th[rowspan]") !== null;
  const nested = doc.querySelector("table table") !== null;
  return { dropped, styled, merged, nested };
}

const escapeCell = (s: string) => s.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim();

function createService(counters: { dataImages: number; relativeImages: number }): TurndownService {
  const service = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "*",
    strongDelimiter: "**",
    hr: "---",
    linkStyle: "inlined",
  });

  service.addRule("strikethrough", {
    filter: ["del", "s", "strike" as keyof HTMLElementTagNameMap],
    replacement: (content) => `~~${content}~~`,
  });

  service.addRule("gfmTable", {
    filter: "table",
    replacement: (_content, node) => {
      const table = node as HTMLTableElement;
      const rows = [...table.querySelectorAll("tr")].filter((tr) => tr.closest("table") === table);
      if (rows.length === 0) return "";
      const toCells = (tr: Element) =>
        [...tr.children]
          .filter((c) => c.tagName === "TH" || c.tagName === "TD")
          .map((c) => escapeCell(service.turndown(c.innerHTML)));
      const grid = rows.map(toCells);
      const width = Math.max(1, ...grid.map((r) => r.length));
      const pad = (r: string[]) => [...r, ...Array(width - r.length).fill("")];
      const line = (r: string[]) => `| ${pad(r).join(" | ")} |`;
      const [head, ...body] = grid;
      return `\n\n${[line(head), line(Array(width).fill("---")), ...body.map(line)].join("\n")}\n\n`;
    },
  });

  service.addRule("images", {
    filter: "img",
    replacement: (_c, node) => {
      const img = node as HTMLImageElement;
      const src = img.getAttribute("src") ?? "";
      const alt = (img.getAttribute("alt") ?? "").replace(/[[\]]/g, "");
      if (src === "" || /^data:/i.test(src)) {
        counters.dataImages++;
        return alt ? t("common.imageAlt", { alt }) : "";
      }
      if (!/^https?:/i.test(src)) counters.relativeImages++;
      return `![${alt}](${src.replace(/ /g, "%20").replace(/\)/g, "%29")})`;
    },
  });

  return service;
}

/** Convert an HTML document or fragment to Markdown, sanitising first and reporting what was lost. */
export function htmlToMarkdown(html: string): HtmlConversion {
  const source = new DOMParser().parseFromString(html, "text/html");
  const audit = auditSource(source);

  const body = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: DROPPED_TAGS,
    FORBID_ATTR: ["style"],
    RETURN_DOM: true,
  }) as unknown as HTMLElement;

  const counters = { dataImages: 0, relativeImages: 0 };
  const markdown = createService(counters).turndown(body.innerHTML).replace(/\n{3,}/g, "\n\n").trim();

  const warnings: string[] = [];
  if (audit.dropped > 0) warnings.push(t("import.warnDropped", { n: audit.dropped }));
  if (audit.styled) warnings.push(t("import.warnStyles"));
  if (audit.merged) warnings.push(t("import.warnMerged"));
  if (audit.nested) warnings.push(t("import.warnNested"));
  if (counters.dataImages > 0) warnings.push(t("import.warnDataImages", { n: counters.dataImages }));
  if (counters.relativeImages > 0) warnings.push(t("import.warnRelativeImages", { n: counters.relativeImages }));
  if (markdown === "") warnings.push(t("import.warnNoText"));

  return { markdown: markdown === "" ? "" : markdown + "\n", warnings };
}
