import JSZip from "jszip";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { exportDocx } from "../exporters/docx";
import { importDocument, validateImportName } from "../importers";
import { docxToMarkdown } from "../importers/docx";
import { htmlToMarkdown } from "../importers/html";
import { DEFAULT_THEME } from "../themes/themes";
import { FileError } from "../shared/errors";

const fixture = (name: string) => readFileSync(resolve(__dirname, "../../fixtures", name), "utf-8");
const bytes = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
const toBuffer = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

describe("HTML → Markdown", () => {
  it("converts common structure", () => {
    const { markdown } = htmlToMarkdown(
      '<h1>標題</h1><p>a <strong>粗</strong> <em>斜</em> <del>刪</del> <a href="https://e.com">連結</a></p>' +
        "<ul><li>甲<ul><li>乙</li></ul></li><li>丙</li></ul><ol><li>一</li><li>二</li></ol>" +
        '<pre><code class="language-js">let a;\n</code></pre><blockquote><p>引</p></blockquote><hr>',
    );
    expect(markdown).toContain("# 標題");
    expect(markdown).toContain("**粗**");
    expect(markdown).toContain("*斜*");
    expect(markdown).toContain("~~刪~~");
    expect(markdown).toContain("[連結](https://e.com)");
    expect(markdown).toMatch(/-\s+甲\n\s+-\s+乙/);
    expect(markdown).toMatch(/1\.\s+一\n2\.\s+二/);
    expect(markdown).toContain("```js\nlet a;\n```");
    expect(markdown).toContain("> 引");
    expect(markdown).toContain("---");
  });

  it("converts tables to GFM pipe tables and escapes pipes", () => {
    const { markdown } = htmlToMarkdown("<table><tr><th>A</th><th>B</th></tr><tr><td>x | y</td><td>z</td></tr></table>");
    expect(markdown).toBe("| A | B |\n| --- | --- |\n| x \\| y | z |\n");
  });

  it("handles fragments without html/body and plain text", () => {
    expect(htmlToMarkdown("<p>只有片段</p>").markdown).toBe("只有片段\n");
    expect(htmlToMarkdown("純文字").markdown).toBe("純文字\n");
  });

  it("removes scripts, styles, iframes and event handlers, and says so", () => {
    const r = htmlToMarkdown(fixture("sample.html"));
    expect(r.markdown).not.toMatch(/script|onload|iframe|evil\.example|__pwn|color: ?red/i);
    expect(r.warnings.join()).toContain("已移除");
  });

  it("never produces javascript: links", () => {
    const { markdown } = htmlToMarkdown('<a href="javascript:alert(1)">x</a> <a href="JaVaScRiPt:alert(1)">y</a>');
    expect(markdown).not.toMatch(/javascript:/i);
    expect(markdown).toContain("x");
  });

  it("reports styles, merged cells, nested tables, data and relative images", () => {
    const w = htmlToMarkdown(
      '<p style="color:red">x</p><table><tr><td colspan="2"><table><tr><td>n</td></tr></table></td></tr></table>' +
        '<img src="data:image/png;base64,AA" alt="a"><img src="rel/x.png" alt="b"><img src="https://e.com/c.png" alt="c">',
    ).warnings.join("\n");
    expect(w).toContain("樣式不會轉為 Markdown");
    expect(w).toContain("合併儲存格");
    expect(w).toContain("巢狀表格");
    expect(w).toContain("1 張內嵌或缺少來源的圖片未匯入");
    expect(w).toContain("1 張圖片使用相對路徑");
  });

  it("keeps https images and drops data: images as text", () => {
    const { markdown } = htmlToMarkdown('<img src="https://e.com/c.png" alt="c"><img src="data:image/png;base64,AA" alt="內嵌">');
    expect(markdown).toContain("![c](https://e.com/c.png)");
    expect(markdown).toContain("[圖片:內嵌]");
    expect(markdown).not.toContain("base64");
  });

  it("warns for documents that yield nothing", () => {
    const r = htmlToMarkdown("<html><body><script>1</script></body></html>");
    expect(r.markdown).toBe("");
    expect(r.warnings.join()).toContain("沒有轉出任何文字內容");
  });

  it("is clean for simple content (no spurious warnings)", () => {
    expect(htmlToMarkdown("<h1>a</h1><p>b</p>").warnings).toEqual([]);
  });

  it("converted output survives the preview sanitiser without active content", async () => {
    const { renderMarkdown } = await import("../markdown/render");
    const out = renderMarkdown(htmlToMarkdown(fixture("sample.html")).markdown);
    expect(out).not.toMatch(/<script|onerror|javascript:/i);
  });
});

describe("importDocument validation", () => {
  it.each(["a.rtf", "a.odt", "a.doc", "a.epub", "a.pdf", "a", "a.md"])("rejects unsupported file %s", async (n) => {
    await expect(importDocument(n, bytes("x"))).rejects.toMatchObject({ code: "unsupported-extension" });
    expect(() => validateImportName(n)).toThrow(FileError);
  });

  it("accepts .html, .htm and .docx names (case-insensitive)", () => {
    for (const n of ["a.html", "A.HTM", "b.DOCX"]) expect(() => validateImportName(n)).not.toThrow();
  });

  it("rejects a zip renamed to .html instead of 'converting' it", async () => {
    const zip = new JSZip();
    zip.file("x.txt", "x");
    const data = await zip.generateAsync({ type: "arraybuffer" });
    await expect(importDocument("fake.html", data)).rejects.toThrow("內容是壓縮檔");
  });

  it("rejects non-zip content named .docx", async () => {
    await expect(importDocument("fake.docx", bytes("<html></html>"))).rejects.toThrow("不是有效的 .docx");
  });

  it("rejects a zip that is not a Word document", async () => {
    const zip = new JSZip();
    zip.file("hello.txt", "x");
    const data = await zip.generateAsync({ type: "arraybuffer" });
    await expect(importDocument("x.docx", data)).rejects.toThrow("不是 Word 文件");
  });

  it("rejects corrupt zips", async () => {
    const bad = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6]).buffer;
    await expect(importDocument("x.docx", bad)).rejects.toMatchObject({ code: "invalid-encoding" });
  });

  it("rejects non-UTF-8 HTML and oversize files", async () => {
    await expect(importDocument("a.html", new Uint8Array([0xff, 0xfe, 0xfd]).buffer)).rejects.toMatchObject({ code: "invalid-encoding" });
    await expect(importDocument("a.html", new ArrayBuffer(5 * 1024 * 1024 + 1))).rejects.toMatchObject({ code: "too-large" });
    await expect(importDocument("a.docx", new ArrayBuffer(20 * 1024 * 1024 + 1))).rejects.toMatchObject({ code: "too-large" });
  });

  it("imports a valid HTML file end to end", async () => {
    const r = await importDocument("page.html", bytes(fixture("sample.html")));
    expect(r.sourceFormat).toBe("html");
    expect(r.markdown).toContain("# 網頁標題");
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

describe("DOCX round trip (export → import)", () => {
  async function roundTrip(md: string) {
    const out = await exportDocx({ markdown: md, title: "t.md", theme: DEFAULT_THEME, style: "print" });
    return importDocument("rt.docx", toBuffer(out.data));
  }

  it("preserves headings, emphasis, links, lists and tables", async () => {
    const r = await roundTrip(
      "# 標題\n\n## 小節\n\n**粗** *斜* ~~刪~~ [連結](https://example.com)\n\n- 甲\n  - 乙\n- 丙\n\n1. 一\n2. 二\n\n| 欄1 | 欄2 |\n|---|---|\n| a | b |\n",
    );
    expect(r.sourceFormat).toBe("docx");
    expect(r.markdown).toContain("# 標題");
    expect(r.markdown).toContain("## 小節");
    expect(r.markdown).toContain("**粗**");
    expect(r.markdown).toContain("~~刪~~");
    expect(r.markdown).toContain("[連結](https://example.com)");
    expect(r.markdown).toMatch(/-\s+甲/);
    expect(r.markdown).toMatch(/-\s+乙/);
    expect(r.markdown).toMatch(/1\.\s+一/);
    // header cells are exported in bold, so they come back bold
    expect(r.markdown).toContain("| **欄1** | **欄2** |");
    expect(r.markdown).toContain("| a | b |");
  });

  it("keeps Traditional Chinese, English and emoji text", async () => {
    const r = await roundTrip("繁體中文 English 😀 100% & done");
    expect(r.markdown).toContain("繁體中文 English 😀 100% & done");
  });

  it("reports the known Word-side losses", async () => {
    const r = await roundTrip("# x");
    expect(r.warnings.join()).toContain("頁首頁尾");
  });

  it("round-trips the full fixture without crashing and keeps its text", async () => {
    const r = await roundTrip(fixture("sample.md"));
    expect(r.markdown).toContain("MarkFlow 測試文件");
    expect(r.markdown).toContain("蘋果");
    expect(r.markdown).toContain("function greet");
  });

  it("warns about images in a Word file and does not embed them", async () => {
    // Build a minimal docx that has a drawing relationship by editing an exported file.
    const out = await exportDocx({ markdown: "文字", title: "t", theme: DEFAULT_THEME, style: "print" });
    const zip = await JSZip.loadAsync(out.data);
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
    zip.file("word/media/image1.png", png);
    zip.file("word/_rels/document.xml.rels", (await zip.file("word/_rels/document.xml.rels")!.async("string")).replace("</Relationships>", '<Relationship Id="rIdImg" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/></Relationships>'));
    const doc = (await zip.file("word/document.xml")!.async("string")).replace(
      "</w:body>",
      '<w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><wp:extent cx="100" cy="100"/><wp:docPr id="1" name="p"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="p"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rIdImg"/></pic:blipFill><pic:spPr/></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p></w:body>',
    );
    zip.file("word/document.xml", doc);
    const data = await zip.generateAsync({ type: "arraybuffer" });
    const r = await docxToMarkdown(data);
    expect(r.markdown).not.toContain("base64");
    expect(r.markdown).not.toContain("mf-omitted");
    expect(r.warnings.join()).toContain("張圖片未匯入");
  });
});
