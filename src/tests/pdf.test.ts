import { buildPrintDocument, cssString, printCss } from "../exporters/pdf";
import {
  DEFAULT_PDF_OPTIONS,
  type PdfOptions,
  pageDimensionsMm,
  pdfOptionsError,
  sanitizePdfOptions,
  supportsPageMarginBoxes,
} from "../exporters/pdfOptions";
import { printHtml } from "../platform/browserPrint";
import { BUILTIN_THEMES, DEFAULT_THEME } from "../themes/themes";

const opts = (p: Partial<PdfOptions> = {}): PdfOptions => ({ ...DEFAULT_PDF_OPTIONS, ...p });
const doc = (md = "# 標題\n\n內容", p: Partial<PdfOptions> = {}, style: "print" | "follow" = "print", theme = DEFAULT_THEME) =>
  buildPrintDocument({ markdown: md, title: "報告.md", theme, style }, opts(p));

describe("page geometry", () => {
  it("A4 portrait/landscape and Letter", () => {
    expect(pageDimensionsMm(opts())).toEqual({ width: 210, height: 297 });
    expect(pageDimensionsMm(opts({ orientation: "landscape" }))).toEqual({ width: 297, height: 210 });
    expect(pageDimensionsMm(opts({ pageSize: "Letter" }))).toEqual({ width: 215.9, height: 279.4 });
  });

  it("custom size is oriented by the orientation setting", () => {
    const c = { pageSize: "Custom", customWidthMm: 300, customHeightMm: 100 } as const;
    expect(pageDimensionsMm(opts(c))).toEqual({ width: 100, height: 300 });
    expect(pageDimensionsMm(opts({ ...c, orientation: "landscape" }))).toEqual({ width: 300, height: 100 });
  });
});

describe("@page rules", () => {
  it("emits size and margins", () => {
    const css = printCss(opts({ marginsMm: { top: 10, right: 15, bottom: 20, left: 25 } }));
    expect(css).toContain("@page{size:210mm 297mm;margin:10mm 15mm 20mm 25mm;");
  });

  it("landscape Letter", () => {
    expect(printCss(opts({ pageSize: "Letter", orientation: "landscape" }))).toContain("size:279.4mm 215.9mm");
  });

  it("page numbers, header and footer use margin boxes only when requested", () => {
    const on = printCss(opts({ pageNumbers: true, headerText: "機密", footerText: "公司" }));
    expect(on).toContain('@top-center{content:"機密"');
    expect(on).toContain('@bottom-left{content:"公司"');
    expect(on).toContain('@bottom-right{content:counter(page) " / " counter(pages)');
    const off = printCss(opts({ pageNumbers: false }));
    expect(off).not.toContain("@top-center");
    expect(off).not.toContain("@bottom-");
  });

  it("header text cannot break out of the CSS string or the rule", () => {
    const evil = '"; } body{display:none} @page{ x:"\\';
    const css = printCss(opts({ headerText: evil }));
    expect(cssString(evil)).toBe('"\\"; } body{display:none} @page{ x:\\"\\\\"');
    expect(css).toContain(`content:${cssString(evil)}`);
    // the injected text must not appear unescaped
    expect(css.replace(cssString(evil), "")).not.toContain("display:none");
  });

  it("escapes angle brackets, ampersands and control characters inside CSS strings", () => {
    expect(cssString("a<b>&\n")).toBe('"a\\3c b\\3e \\26 \\a "');
  });

  it("background option", () => {
    expect(printCss(opts({ includeBackground: false }))).toContain("background:#fff !important");
    const on = printCss(opts({ includeBackground: true }));
    expect(on).toContain("print-color-adjust:exact");
    expect(on).not.toContain("#fff !important");
  });

  it("pagination rules: keep headings with content, rows/images intact, repeat table headers", () => {
    const css = printCss(opts());
    expect(css).toContain("break-after:avoid-page");
    expect(css).toContain(".markdown-body tr,.markdown-body img,.markdown-body blockquote{break-inside:avoid-page}");
    expect(css).toContain("table-header-group");
    expect(css).toContain("max-width:none"); // reading-width cap must not apply to print
  });

  it("images are capped to the printable height of the page", () => {
    // A4 landscape, 20mm margins: 210 - 40 - 5 = 165mm
    expect(printCss(opts({ orientation: "landscape" }))).toContain("max-height:165mm");
  });

  it("long code wraps unless disabled", () => {
    expect(printCss(opts({ wrapCode: true }))).toContain("white-space:pre-wrap");
    expect(printCss(opts({ wrapCode: false }))).not.toContain("white-space:pre-wrap");
  });
});

describe("buildPrintDocument", () => {
  it("returns a full HTML document containing @page, the content and the file name as title", () => {
    const { content } = doc();
    expect(content).toContain("<!doctype html>");
    expect(content).toContain("@page{");
    expect(content).toContain("<h1>標題</h1>");
    expect(content).toContain("<title>報告</title>");
  });

  it("stays light under a dark editor theme in print style, follows it otherwise", () => {
    const dark = BUILTIN_THEMES[1];
    expect(doc("# x", {}, "print", dark).content).toContain("--preview-bg:#ffffff");
    expect(doc("# x", {}, "follow", dark).content).toContain(`--preview-bg:${dark.previewBackground}`);
  });

  it("keeps or strips hyperlinks", () => {
    const md = "[官網](https://e.com) 與 **粗**";
    expect(doc(md, { keepLinks: true }).content).toContain('<a href="https://e.com"');
    const stripped = doc(md, { keepLinks: false }).content;
    expect(stripped).not.toContain("<a ");
    expect(stripped).toContain("官網");
    expect(stripped).toContain("<strong>粗</strong>");
  });

  it("is still script-free with hostile input", () => {
    const { content } = doc("<script>x</script>\n\n[a](javascript:alert(1))", { headerText: "</style><script>1</script>" });
    expect(content).not.toMatch(/<script/i);
    expect(content).not.toContain("</style><script>");
    expect(content).toContain("default-src 'none'");
  });

  it("replaces images that cannot print with their alt text instead of broken-image icons", () => {
    const r = doc("![貓咪](./cat.png) ![遠端](https://e.com/a.png) ![內嵌](data:image/png;base64,AAAA) ![](x.png)");
    expect(r.content).toContain("[圖片:貓咪]");
    expect(r.content).toContain("[圖片:遠端]");
    expect(r.content).toContain("[圖片:未命名]");
    expect(r.content).not.toContain('src="./cat.png"');
    expect(r.content).not.toContain("https://e.com/a.png");
    expect(r.content).toContain('src="data:image/png;base64,AAAA"'); // embedded images still print
    expect(r.warnings.join()).toContain("3 張圖片無法放入 PDF");
    expect(r.warnings.join()).not.toContain("匯出的 HTML");
  });

  it("does not warn about images when there are none", () => {
    expect(doc("沒有圖片").warnings.join()).not.toContain("圖片");
  });

  it("always warns that the preview is approximate", () => {
    expect(doc().warnings.join()).toContain("實際分頁請以瀏覽器列印預覽為準");
  });

  it("rejects margins that leave no usable area", () => {
    expect(() => doc("x", { marginsMm: { top: 0, bottom: 0, left: 100, right: 100 } })).toThrow("左右邊距");
    expect(() => doc("x", { marginsMm: { top: 100, bottom: 100, left: 0, right: 0 }, pageSize: "Custom", customHeightMm: 150 })).toThrow("上下邊距");
  });

  it("handles long tables, multi-page content, CJK and emoji", () => {
    const rows = Array.from({ length: 200 }, (_, i) => `| 列${i} | 😀 |`).join("\n");
    const { content } = doc(`| 欄 | 欄 |\n|---|---|\n${rows}`);
    expect(content).toContain("<thead>");
    expect(content.match(/<tr>/g)?.length).toBe(201);
  });
});

describe("option validation", () => {
  it("clamps and defaults bad persisted data", () => {
    const s = sanitizePdfOptions({
      pageSize: "A0",
      customWidthMm: 5,
      customHeightMm: 99999,
      orientation: "sideways",
      marginsMm: { top: -5, right: "x", bottom: 1000, left: NaN },
      pageNumbers: "yes",
      headerText: "a\u0000b".repeat(100),
    });
    expect(s.pageSize).toBe("A4");
    expect(s.customWidthMm).toBe(50);
    expect(s.customHeightMm).toBe(1000);
    expect(s.orientation).toBe("portrait");
    expect(s.marginsMm).toEqual({ top: 0, right: 20, bottom: 100, left: 20 });
    expect(s.pageNumbers).toBe(true);
    expect(s.headerText).not.toContain("\u0000");
    expect(s.headerText.length).toBeLessThanOrEqual(120);
    expect(sanitizePdfOptions(null)).toEqual(DEFAULT_PDF_OPTIONS);
  });

  it("default options are valid", () => {
    expect(pdfOptionsError(DEFAULT_PDF_OPTIONS)).toBeNull();
  });

  it("detects margin-box support from the user agent", () => {
    expect(supportsPageMarginBoxes("Mozilla/5.0 Chrome/131.0.0.0 Safari/537.36")).toBe(true);
    expect(supportsPageMarginBoxes("Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36 Edg/120.0")).toBe(false);
    expect(supportsPageMarginBoxes("Mozilla/5.0 Edg/140.0.0.0")).toBe(true);
    expect(supportsPageMarginBoxes("Mozilla/5.0 Firefox/130.0")).toBe(false);
    expect(supportsPageMarginBoxes("")).toBe(false);
  });
});

describe("printHtml", () => {
  afterEach(() => {
    document.querySelectorAll("iframe").forEach((f) => f.remove());
    vi.restoreAllMocks();
  });

  function fakeWindow() {
    const listeners: Record<string, () => void> = {};
    return {
      focus: vi.fn(),
      print: vi.fn(),
      addEventListener: (t: string, fn: () => void) => void (listeners[t] = fn),
      listeners,
    };
  }

  it("loads the document into a hidden iframe, prints it, and removes it after printing", async () => {
    const win = fakeWindow();
    vi.spyOn(HTMLIFrameElement.prototype, "contentWindow", "get").mockReturnValue(win as unknown as Window);
    const p = printHtml("<p>hi</p>");
    const frame = document.querySelector("iframe")!;
    expect(frame.srcdoc).toBe("<p>hi</p>");
    expect(frame.getAttribute("aria-hidden")).toBe("true");
    frame.dispatchEvent(new Event("load"));
    await p;
    expect(win.print).toHaveBeenCalledTimes(1);
    expect(document.querySelector("iframe")).not.toBeNull();
    win.listeners.afterprint();
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("rejects and cleans up when printing throws", async () => {
    const win = fakeWindow();
    win.print.mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(HTMLIFrameElement.prototype, "contentWindow", "get").mockReturnValue(win as unknown as Window);
    const p = printHtml("<p>x</p>");
    document.querySelector("iframe")!.dispatchEvent(new Event("load"));
    await expect(p).rejects.toThrow("blocked");
    expect(document.querySelector("iframe")).toBeNull();
  });
});
