import { exportHtml, resolveExportTheme } from "../exporters/html";
import { markdownToText } from "../exporters/txt";
import { buildExportFileName, defaultExportName } from "../exporters/fileName";
import { BUILTIN_THEMES, DEFAULT_THEME } from "../themes/themes";
import { exportToFile } from "../files/exportFile";
import { FileError } from "../shared/errors";

const dark = BUILTIN_THEMES[1];
const html = (markdown: string, style: "follow" | "print" = "print", theme = DEFAULT_THEME, title = "t.md") =>
  exportHtml({ markdown, title, theme, style });

describe("HTML export", () => {
  it("produces a complete document with charset, lang, title and embedded CSS", () => {
    const { content } = html("# 標題\n\n內容", "print", DEFAULT_THEME, "file.md");
    expect(content.startsWith("<!doctype html>")).toBe(true);
    expect(content).toContain('<html lang="zh-Hant">');
    expect(content).toContain('<meta charset="utf-8">');
    expect(content).toContain("<title>標題</title>");
    expect(content).toContain("<style>");
    expect(content).toContain(".markdown-body h1");
    expect(content).toContain(".markdown-body table");
    expect(content).toContain("<h1>標題</h1>");
  });

  it("falls back to the file name for the title and escapes it", () => {
    expect(html("no heading", "print", DEFAULT_THEME, "筆記.md").content).toContain("<title>筆記</title>");
    expect(html("# <b>&\"x\"</b>").content).toContain("<title>&lt;b&gt;&amp;&quot;x&quot;&lt;/b&gt;</title>");
  });

  it("contains tables, links, code blocks and emoji", () => {
    const { content } = html("| a | b |\n|---|---|\n| 1 | 2 |\n\n[l](https://e.com)\n\n```js\nlet x;\n```\n\n😀");
    expect(content).toContain("<table>");
    expect(content).toContain('href="https://e.com"');
    expect(content).toContain('class="language-js"');
    expect(content).toContain("😀");
  });

  it("is script-free and locked down by CSP, even for hostile input", () => {
    const { content } = html('<script>alert(1)</script>\n\n[x](javascript:alert(1))\n\n<img src=x onerror=alert(1)>');
    expect(content).not.toMatch(/<script/i);
    expect(content).not.toMatch(/<a [^>]*javascript:/i);
    expect(content).not.toMatch(/<img/i);
    expect(content).toContain("default-src 'none'");
    expect(content).not.toContain("script-src");
  });

  it("keeps editor look and export look separate: print style stays light under a dark theme", () => {
    const printed = html("# x", "print", dark).content;
    expect(printed).toContain("--preview-bg:#ffffff");
    expect(printed).not.toContain(dark.previewBackground);
    const followed = html("# x", "follow", dark).content;
    expect(followed).toContain(`--preview-bg:${dark.previewBackground}`);
  });

  it("print style keeps the user's typography", () => {
    const t = resolveExportTheme({ ...dark, fontSizePx: 22, fontFamily: "serif" }, "print");
    expect(t.fontSizePx).toBe(22);
    expect(t.fontFamily).toBe("serif");
    expect(t.textColor).toBe(DEFAULT_THEME.textColor);
  });

  it("warns about local and remote images", () => {
    const w = html("![a](./pic.png) ![b](https://e.com/b.png) ![c](data:image/png;base64,AAAA)").warnings;
    expect(w.some((x) => x.includes("1 張圖片使用相對路徑"))).toBe(true);
    expect(w.some((x) => x.includes("1 張圖片是外部網址"))).toBe(true);
    expect(html("plain").warnings).toEqual([]);
  });

  it("handles an empty document", () => {
    expect(() => html("")).not.toThrow();
  });
});

describe("TXT export", () => {
  it("strips Markdown syntax but keeps readable text", () => {
    const { content } = markdownToText("# 標題\n\n**粗** *斜* ~~刪~~ `code`\n\n第二段");
    expect(content).toBe("標題\n\n粗 斜 刪 code\n\n第二段\n");
  });

  it("renders bullet, ordered and nested lists with indentation", () => {
    const { content } = markdownToText("- a\n  - b\n- c\n\n3. x\n4. y");
    expect(content).toBe("- a\n  - b\n- c\n\n3. x\n4. y\n");
  });

  it("keeps code blocks verbatim", () => {
    expect(markdownToText("```js\nconst a = 1;\n  indented\n```").content).toBe("const a = 1;\n  indented\n");
  });

  it("shows link targets, but not when text already is the URL", () => {
    expect(markdownToText("[官網](https://e.com)").content).toBe("官網 (https://e.com)\n");
    expect(markdownToText("<https://e.com>").content).toBe("https://e.com\n");
    expect(markdownToText("[x](javascript:alert(1))").content).toContain("[x](javascript:alert(1))");
  });

  it("prefixes block quotes and renders horizontal rules", () => {
    expect(markdownToText("> 引用\n\n---").content).toBe("> 引用\n\n----------\n");
  });

  it("flattens tables and reports it", () => {
    const r = markdownToText("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(r.content).toBe("a | b\n1 | 2\n");
    expect(r.warnings.join()).toContain("表格");
  });

  it("replaces images with alt text and warns", () => {
    const r = markdownToText("![貓咪](cat.png)");
    expect(r.content).toBe("貓咪\n");
    expect(r.warnings.join()).toContain("圖片");
  });

  it("returns empty content for an empty document and handles CJK/emoji", () => {
    expect(markdownToText("").content).toBe("");
    expect(markdownToText("繁體中文 😀").content).toBe("繁體中文 😀\n");
  });
});

describe("export file names", () => {
  it("appends the extension once", () => {
    expect(buildExportFileName("report", ".html")).toBe("report.html");
    expect(buildExportFileName("report.html", ".html")).toBe("report.html");
    expect(buildExportFileName("  中文 檔名 ", ".txt")).toBe("中文 檔名.txt");
  });

  it.each(["", "   ", "a/b", "a:b", "a*", "a?", "a\u0001", "name.", "CON", "nul", "COM1", "x".repeat(200)])(
    "rejects %j",
    (n) => {
      expect(() => buildExportFileName(n, ".html")).toThrow(FileError);
    },
  );

  it("derives a default name from the document title", () => {
    expect(defaultExportName("筆記.md")).toBe("筆記");
    expect(defaultExportName("a:b.markdown")).toBe("a_b");
    expect(defaultExportName("")).toBe("未命名");
  });
});

describe("exportToFile", () => {
  const target = { fileName: "o.html", extension: ".html", mime: "text/html", description: "HTML" };
  const w = window as unknown as Record<string, unknown>;
  afterEach(() => delete w.showSaveFilePicker);

  function handle(opts: { same?: boolean; size?: number; failWrite?: boolean } = {}) {
    const written: string[] = [];
    const h = {
      name: "o.html",
      isSameEntry: async () => opts.same ?? false,
      getFile: async () => ({ size: opts.size ?? 10 }),
      createWritable: async () => ({
        write: async (t: string) => {
          if (opts.failWrite) throw new Error("boom");
          written.push(t);
        },
        close: async () => undefined,
        abort: async () => undefined,
      }),
    };
    return { h: h as unknown as FileSystemFileHandle, written };
  }

  it("writes content and returns the saved name", async () => {
    const { h, written } = handle();
    w.showSaveFilePicker = async () => h;
    expect(await exportToFile("<p>x</p>", target)).toMatchObject({ name: "o.html" });
    expect(written).toEqual(["<p>x</p>"]);
  });

  it("refuses to overwrite the source document and writes nothing", async () => {
    const { h, written } = handle({ same: true });
    w.showSaveFilePicker = async () => h;
    await expect(exportToFile("x", target, h)).rejects.toThrow("不可覆寫來源文件");
    expect(written).toEqual([]);
  });

  it("returns null when cancelled", async () => {
    w.showSaveFilePicker = async () => {
      throw new DOMException("x", "AbortError");
    };
    expect(await exportToFile("x", target)).toBeNull();
  });

  it("rejects empty content and empty output files", async () => {
    await expect(exportToFile("", target)).rejects.toBeInstanceOf(FileError);
    w.showSaveFilePicker = async () => handle({ size: 0 }).h;
    await expect(exportToFile("x", target)).rejects.toThrow("輸出檔案是空的");
  });

  it("reports write failures as FileError", async () => {
    w.showSaveFilePicker = async () => handle({ failWrite: true }).h;
    await expect(exportToFile("x", target)).rejects.toBeInstanceOf(FileError);
  });
});
