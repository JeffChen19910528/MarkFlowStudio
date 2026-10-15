import JSZip from "jszip";
import { exportDocx, validateDocx } from "../exporters/docx";
import { BUILTIN_THEMES, DEFAULT_THEME } from "../themes/themes";

async function build(markdown: string, style: "print" | "follow" = "print", theme = DEFAULT_THEME) {
  const out = await exportDocx({ markdown, title: "報告.md", theme, style });
  const zip = await JSZip.loadAsync(out.data);
  const xml = await zip.file("word/document.xml")!.async("string");
  const rels = (await zip.file("word/_rels/document.xml.rels")?.async("string")) ?? "";
  const styles = (await zip.file("word/styles.xml")?.async("string")) ?? "";
  const numbering = (await zip.file("word/numbering.xml")?.async("string")) ?? "";
  const core = (await zip.file("docProps/core.xml")?.async("string")) ?? "";
  const text = [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("");
  return { ...out, zip, xml, rels, styles, numbering, core, text };
}

describe("DOCX export", () => {
  it("produces a valid OOXML package with the required parts", async () => {
    const r = await build("# 標題\n\n內容");
    expect(r.data[0]).toBe(0x50); // "PK"
    expect(r.data[1]).toBe(0x4b);
    for (const part of ["[Content_Types].xml", "word/document.xml", "word/styles.xml", "_rels/.rels"]) {
      expect(r.zip.file(part), part).not.toBeNull();
    }
    await expect(validateDocx(r.data)).resolves.toBeUndefined();
  });

  it("keeps Traditional Chinese, English, emoji and special characters readable", async () => {
    const r = await build("繁體中文 English 😀 & <tag> \"quote\"");
    expect(r.text).toContain("繁體中文 English 😀 &amp; &lt;tag&gt;");
  });

  it("maps headings to Word heading styles and sets the document title", async () => {
    const r = await build("# 一\n\n## 二\n\n###### 六");
    expect(r.xml).toContain('<w:pStyle w:val="Heading1"/>');
    expect(r.xml).toContain('<w:pStyle w:val="Heading2"/>');
    expect(r.xml).toContain('<w:pStyle w:val="Heading6"/>');
    expect(r.styles).toContain('w:styleId="Heading1"');
    expect(r.core).toContain("<dc:title>報告</dc:title>");
  });

  it("applies bold, italic, strikethrough and inline code", async () => {
    const r = await build("**粗** *斜* ~~刪~~ `code`");
    expect(r.xml).toContain("<w:b/>");
    expect(r.xml).toContain("<w:i/>");
    expect(r.xml).toContain("<w:strike/>");
    expect(r.xml).toMatch(/w:ascii="Consolas"/);
  });

  it("creates real hyperlinks for http(s)/mailto and keeps the link text", async () => {
    const r = await build("[官網](https://example.com/a?b=1&c=2) 與 [信](mailto:a@b.co)");
    expect(r.xml).toContain("<w:hyperlink");
    expect(r.text).toContain("官網");
    expect(r.rels).toContain("https://example.com/a?b=1&amp;c=2");
    expect(r.rels).toContain("mailto:a@b.co");
  });

  it("never creates a hyperlink for dangerous schemes", async () => {
    const r = await build("[x](javascript:alert(1)) [y](data:text/html;base64,AAAA)");
    expect(r.xml).not.toContain("<w:hyperlink");
    expect(r.rels).not.toContain("javascript:");
    expect(r.rels).not.toContain("data:text/html");
  });

  it("exports bullet, nested and ordered lists with separate numbering instances", async () => {
    const r = await build("- a\n  - b\n- c\n\n1. x\n2. y\n\ntext\n\n1. again");
    expect(r.xml).toContain('<w:ilvl w:val="0"/>');
    expect(r.xml).toContain('<w:ilvl w:val="1"/>');
    expect(r.numbering).toContain('w:numFmt w:val="bullet"');
    expect(r.numbering).toContain('w:numFmt w:val="decimal"');
    const numIds = new Set([...r.xml.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map((m) => m[1]));
    expect(numIds.size).toBeGreaterThanOrEqual(3); // bullets + two independent ordered lists
    expect(r.text).toContain("abcxytextagain");
  });

  it("exports tables with a repeating header row", async () => {
    const r = await build("| 欄1 | 欄2 |\n|:---:|---|\n| a | b |\n| c | d |");
    expect(r.xml).toContain("<w:tbl>");
    expect(r.xml.match(/<w:tr>|<w:tr /g)?.length).toBe(3);
    expect(r.xml).toContain("<w:tblHeader");
    expect(r.xml).toContain("<w:cantSplit");
    expect(r.xml).toContain('<w:jc w:val="center"/>');
    expect(r.text).toContain("欄1欄2abcd");
  });

  it("keeps code blocks line by line in a monospace font and preserves indentation", async () => {
    const r = await build("```js\nconst a = 1;\n    indented\n```");
    expect(r.xml).toContain("const a = 1;");
    expect(r.xml).toMatch(/xml:space="preserve">\s{4}indented/);
    expect(r.xml).toMatch(/w:ascii="Consolas"/);
  });

  it("exports block quotes and horizontal rules", async () => {
    const r = await build("> 引用\n\n---");
    expect(r.xml).toContain("<w:pBdr>");
    expect(r.xml).toMatch(/<w:left [^>]*w:val="single"/);
    expect(r.xml).toMatch(/<w:bottom [^>]*w:val="single"/);
    expect(r.text).toContain("引用");
  });

  it("does not embed images and reports it", async () => {
    const r = await build("![貓咪](cat.png) ![](https://e.com/x.png)");
    expect(r.warnings.join()).toContain("2 張圖片未嵌入");
    expect(r.text).toContain("[圖片:貓咪]");
    expect(r.zip.file(/media\//).length).toBe(0);
  });

  it("warns about unsupported list start numbers and ignored page background", async () => {
    expect((await build("5. a\n6. b")).warnings.join()).toContain("起始編號");
    const dark = await build("x", "follow", BUILTIN_THEMES[1]);
    expect(dark.warnings.join()).toContain("背景色不會套用");
    expect((await build("x", "print", BUILTIN_THEMES[1])).warnings).toEqual([]);
  });

  it("print style keeps dark editor colours out of the document", async () => {
    const dark = BUILTIN_THEMES[1];
    const printed = await build("# x", "print", dark);
    expect(printed.styles.toUpperCase()).toContain(DEFAULT_THEME.headingColor.slice(1).toUpperCase());
    expect(printed.styles.toUpperCase()).not.toContain(dark.textColor.slice(1).toUpperCase());
    const followed = await build("# x", "follow", dark);
    expect(followed.styles.toUpperCase()).toContain(dark.textColor.slice(1).toUpperCase());
  });

  it("applies typography from the theme (font size in half-points)", async () => {
    const r = await build("x", "print", { ...DEFAULT_THEME, fontSizePx: 20 });
    expect(r.styles).toContain('<w:sz w:val="30"/>'); // 20px = 15pt = 30 half-points
  });

  it("rejects an empty document instead of writing an empty file", async () => {
    await expect(exportDocx({ markdown: "", title: "t", theme: DEFAULT_THEME, style: "print" })).rejects.toThrow("沒有可匯出的內容");
  });

  it("handles a large multi-page document", async () => {
    const md = Array.from({ length: 300 }, (_, i) => `## 章節 ${i}\n\n第 ${i} 段內容,含 **粗體** 與 [連結](https://e.com/${i})。`).join("\n\n");
    const r = await build(md);
    expect(r.text).toContain("章節 299");
    expect(r.data.length).toBeGreaterThan(5_000);
  });
});

describe("validateDocx", () => {
  it("rejects non-zip data and zips without a document part", async () => {
    await expect(validateDocx(new Uint8Array([1, 2, 3, 4, 5]))).rejects.toThrow("不是有效的壓縮檔");
    const zip = new JSZip();
    zip.file("hello.txt", "x");
    const data = new Uint8Array(await zip.generateAsync({ type: "arraybuffer" }));
    await expect(validateDocx(data)).rejects.toThrow("缺少必要內容");
  });
});
