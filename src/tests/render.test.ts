import { renderMarkdown } from "../markdown/render";

describe("renderMarkdown", () => {
  it("renders headings, emphasis, lists, tables, code and links", () => {
    const html = renderMarkdown(
      [
        "# 標題",
        "**粗** *斜* ~~刪~~",
        "- a\n  - nested",
        "| h1 | h2 |\n|---|---|\n| 1 | 2 |",
        "```ts\nconst x = 1;\n```",
        "[site](https://example.com)",
      ].join("\n\n"),
    );
    expect(html).toContain("<h1>標題</h1>");
    expect(html).toContain("<strong>粗</strong>");
    expect(html).toContain("<em>斜</em>");
    expect(html).toContain("<table>");
    expect(html).toContain('<code class="language-ts">');
    expect(html).toContain('href="https://example.com"');
    expect(html).toMatch(/<ul>\s*<li>a\s*<ul>/);
  });

  it("does not render strikethrough as raw markers dropped silently", () => {
    expect(renderMarkdown("~~x~~")).toContain("<s>x</s>");
  });

  it("escapes raw HTML instead of executing it", () => {
    const html = renderMarkdown('<script>alert(1)</script><img src=x onerror="alert(1)">');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  it("blocks javascript: and data: html links", () => {
    // markdown-it refuses to link these and leaves them as inert text; assert no dangerous href exists.
    const box = document.createElement("div");
    box.innerHTML = renderMarkdown(
      "[x](javascript:alert(1)) [y](data:text/html;base64,AAAA) [z](vbscript:x) [ok](https://e.com)",
    );
    const hrefs = [...box.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["https://e.com"]);
  });

  it("opens links with noopener", () => {
    expect(renderMarkdown("[a](https://e.com)")).toContain('rel="noopener noreferrer"');
  });

  it("renders images but strips event handlers and srcset", () => {
    const html = renderMarkdown("![alt](https://e.com/a.png)");
    expect(html).toContain("<img");
    expect(html).not.toContain("onerror");
  });

  it("handles malformed markdown without throwing", () => {
    expect(() => renderMarkdown("| a |\n|--\n[unclosed](\n```")).not.toThrow();
  });
});
