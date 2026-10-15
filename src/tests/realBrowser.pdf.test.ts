/**
 * Opt-in check against a REAL Chromium: prints the generated print-documents to PDF with
 * `chrome --headless --print-to-pdf` and inspects the result. Skipped unless MARKFLOW_CHROME points
 * at a Chrome/Edge executable, because CI machines and contributors may not have one:
 *
 *   MARKFLOW_CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe" npm test -- realBrowser
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildPrintDocument } from "../exporters/pdf";
import { DEFAULT_PDF_OPTIONS, type PdfOptions } from "../exporters/pdfOptions";
import { BUILTIN_THEMES, DEFAULT_THEME } from "../themes/themes";

const chrome = process.env.MARKFLOW_CHROME;
const sample = readFileSync(resolve(__dirname, "../../fixtures/sample.md"), "utf-8");

const longDoc =
  sample +
  "\n\n# 長表格\n\n| 項目 | 數值 |\n|---|---|\n" +
  Array.from({ length: 80 }, (_, i) => `| 第 ${i + 1} 列 | ${i * 7} |`).join("\n") +
  "\n\n" +
  Array.from({ length: 10 }, (_, i) => `## 章節 ${i + 1}\n\n` + "中文段落重複用來撐出多頁內容。".repeat(40)).join("\n\n");

function printToPdf(html: string): { bytes: string; pages: number; mediaBox: number[] } {
  const dir = mkdtempSync(join(tmpdir(), "markflow-"));
  try {
    const htmlPath = join(dir, "in.html");
    const pdfPath = join(dir, "out.pdf");
    writeFileSync(htmlPath, html);
    execFileSync(
      chrome!,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        `--user-data-dir=${join(dir, "profile")}`,
        "--no-pdf-header-footer",
        `--print-to-pdf=${pdfPath}`,
        pathToFileURL(htmlPath).href,
      ],
      { stdio: "ignore", timeout: 60_000 },
    );
    const bytes = readFileSync(pdfPath).toString("latin1");
    const pages = (bytes.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    const box = /\/MediaBox\s*\[\s*([\d.\s-]+)\]/.exec(bytes)?.[1].trim().split(/\s+/).map(Number) ?? [];
    return { bytes, pages, mediaBox: box };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const pt = (mm: number) => (mm / 25.4) * 72;
/** Chrome snaps page sizes to device pixels, so allow up to 1pt (~0.35 mm) of difference. */
const near = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThan(1);
const opts = (p: Partial<PdfOptions> = {}): PdfOptions => ({ ...DEFAULT_PDF_OPTIONS, ...p });
const build = (md: string, o: PdfOptions, theme = DEFAULT_THEME) =>
  buildPrintDocument({ markdown: md, title: "t", theme, style: "print" }, o).content;

describe.skipIf(!chrome)("PDF printed by a real browser", () => {
  it("is a valid multi-page A4 PDF", () => {
    const r = printToPdf(build(longDoc, opts()));
    expect(r.bytes.startsWith("%PDF-")).toBe(true);
    expect(r.bytes).toContain("%%EOF");
    expect(r.pages).toBeGreaterThan(3);
    near(r.mediaBox[2], pt(210));
    near(r.mediaBox[3], pt(297));
  });

  it("honours Letter landscape", () => {
    const r = printToPdf(build(sample, opts({ pageSize: "Letter", orientation: "landscape" })));
    near(r.mediaBox[2], pt(279.4));
    near(r.mediaBox[3], pt(215.9));
  });

  it("honours a custom page size", () => {
    const r = printToPdf(build(sample, opts({ pageSize: "Custom", customWidthMm: 100, customHeightMm: 150 })));
    near(r.mediaBox[2], pt(100));
    near(r.mediaBox[3], pt(150));
  });

  it("produces a PDF with embedded fonts for Traditional Chinese text", () => {
    const r = printToPdf(build(sample, opts(), BUILTIN_THEMES[1]));
    expect(r.bytes).toMatch(/\/FontFile2|\/FontFile3/);
  });

  it("embeds a local image into the PDF as a real image object", () => {
    const png = Uint8Array.from(
      atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="),
      (c) => c.charCodeAt(0),
    ) as Uint8Array<ArrayBuffer>;
    const images = new Map([["./a.png", { bytes: png, mime: "image/png" as const, width: 1, height: 1 }]]);
    const withImage = buildPrintDocument({ markdown: "![圖](./a.png)", title: "t", theme: DEFAULT_THEME, style: "print", images }, opts()).content;
    const without = buildPrintDocument({ markdown: "![圖](./a.png)", title: "t", theme: DEFAULT_THEME, style: "print" }, opts()).content;
    expect(printToPdf(withImage).bytes).toMatch(/\/Subtype\s*\/Image/);
    expect(printToPdf(without).bytes).not.toMatch(/\/Subtype\s*\/Image/); // placeholder text, no broken-image object
  });
});
