import JSZip from "jszip";
import { exportDocx } from "../exporters/docx";
import { exportHtml } from "../exporters/html";
import { buildPrintDocument } from "../exporters/pdf";
import { DEFAULT_PDF_OPTIONS } from "../exporters/pdfOptions";
import { importDocument } from "../importers";
import type { ResolvedImage } from "../images";
import { DEFAULT_THEME } from "../themes/themes";

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>;
const PNG = b64("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==");
const GIF = b64("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7");
const JPEG = b64("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=");
const WEBP = b64("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==");

const img = (bytes: Uint8Array<ArrayBuffer>, mime: ResolvedImage["mime"], width = 1, height = 1): ResolvedImage => ({ bytes, mime, width, height });
const base = { title: "t.md", theme: DEFAULT_THEME, style: "print" as const };

describe("HTML export with local images", () => {
  const md = "![貓](./a.png) ![無](./missing.png)";
  const images = new Map([["./a.png", img(PNG, "image/png", 120, 80)]]);

  it("embeds resolved images as data URIs and leaves unresolved ones alone", () => {
    const { content, warnings } = exportHtml({ markdown: md, ...base, images });
    expect(content).toMatch(/<img src="data:image\/png;base64,[A-Za-z0-9+/=]+"/);
    expect(content).toContain('width="120"');
    expect(content).toContain('height="80"');
    expect(content).toContain("./missing.png");
    expect(warnings.join()).toContain("1 張圖片使用相對路徑");
    expect(warnings.join()).toContain("圖片資料夾");
  });

  it("is silent about images when everything resolved", () => {
    const { warnings } = exportHtml({ markdown: "![貓](./a.png)", ...base, images });
    expect(warnings).toEqual([]);
  });

  it("keeps the self-contained CSP, which allows data: images", () => {
    const { content } = exportHtml({ markdown: md, ...base, images });
    expect(content).toContain("img-src https: data:");
    expect(content).not.toMatch(/<script/i);
  });

  it("without any granted folder behaves as before", () => {
    expect(exportHtml({ markdown: md, ...base }).content).not.toContain("data:image/png");
  });

  it("does not let a crafted file name inject markup", () => {
    const evil = new Map([['x"onerror="alert(1)', img(PNG, "image/png")]]);
    const { content } = exportHtml({ markdown: "![a](x%22onerror=%22alert(1))", ...base, images: evil });
    // The text "onerror" may appear inside the src value; what matters is that no element gained a handler.
    const doc = new DOMParser().parseFromString(content, "text/html");
    for (const el of doc.querySelectorAll("*")) {
      expect([...el.attributes].some((a) => a.name.startsWith("on"))).toBe(false);
    }
  });
});

describe("PDF print document with local images", () => {
  it("keeps resolved images (as data URIs) and replaces only the unresolved ones", () => {
    const images = new Map([["./a.png", img(PNG, "image/png")]]);
    const r = buildPrintDocument({ markdown: "![貓](./a.png) ![無](./missing.png)", ...base, images }, DEFAULT_PDF_OPTIONS);
    expect(r.content).toContain("data:image/png;base64,");
    expect(r.content).toContain("[圖片:無]");
    expect(r.content).not.toContain("[圖片:貓]");
    expect(r.warnings.join()).toContain("1 張圖片無法放入 PDF");
  });

  it("has no image warning when all images resolved", () => {
    const images = new Map([["./a.png", img(PNG, "image/png")]]);
    const r = buildPrintDocument({ markdown: "![貓](./a.png)", ...base, images }, DEFAULT_PDF_OPTIONS);
    expect(r.warnings.join()).not.toContain("圖片");
  });
});

describe("DOCX export with local images", () => {
  async function build(markdown: string, images?: Map<string, ResolvedImage>) {
    const out = await exportDocx({ markdown, ...base, images });
    const zip = await JSZip.loadAsync(out.data);
    return {
      ...out,
      zip,
      xml: await zip.file("word/document.xml")!.async("string"),
      media: zip.file(/^word\/media\//),
    };
  }

  it("embeds PNG, JPEG and GIF as real image parts", async () => {
    const r = await build(
      "![p](./p.png) ![j](./j.jpg) ![g](./g.gif)",
      new Map([
        ["./p.png", img(PNG, "image/png")],
        ["./j.jpg", img(JPEG, "image/jpeg")],
        ["./g.gif", img(GIF, "image/gif")],
      ]),
    );
    expect(r.media).toHaveLength(3);
    expect(r.media.map((f) => f.name.split(".").pop()).sort()).toEqual(["gif", "jpg", "png"]);
    expect(r.xml.match(/<w:drawing>/g)).toHaveLength(3);
    expect(r.warnings).toEqual([]);
    expect(r.xml).not.toContain("[圖片:");
  });

  it("stores the original bytes unchanged", async () => {
    const r = await build("![p](./p.png)", new Map([["./p.png", img(PNG, "image/png")]]));
    const stored = new Uint8Array(await r.media[0].async("arraybuffer"));
    expect(stored).toEqual(PNG);
  });

  it("scales large images down to the page width and keeps the aspect ratio", async () => {
    const r = await build("![big](./b.png)", new Map([["./b.png", img(PNG, "image/png", 1200, 600)]]));
    const cx = Number(/<wp:extent cx="(\d+)" cy="(\d+)"/.exec(r.xml)![1]);
    const cy = Number(/<wp:extent cx="(\d+)" cy="(\d+)"/.exec(r.xml)![2]);
    expect(cx).toBe(600 * 9525);
    expect(cy).toBe(300 * 9525);
  });

  it("limits very tall images by height and never upscales small ones", async () => {
    const tall = await build("![t](./t.png)", new Map([["./t.png", img(PNG, "image/png", 500, 4000)]]));
    const cy = Number(/<wp:extent cx="(\d+)" cy="(\d+)"/.exec(tall.xml)![2]);
    expect(cy).toBe(800 * 9525);
    const small = await build("![s](./s.png)", new Map([["./s.png", img(PNG, "image/png", 40, 30)]]));
    expect(Number(/<wp:extent cx="(\d+)" cy="(\d+)"/.exec(small.xml)![1])).toBe(40 * 9525);
  });

  it("records the alt text on the picture", async () => {
    const r = await build("![貓咪的照片](./p.png)", new Map([["./p.png", img(PNG, "image/png")]]));
    expect(r.xml).toContain("貓咪的照片");
  });

  it("WebP cannot be embedded: it becomes text and the user is told why", async () => {
    const r = await build("![w](./w.webp)", new Map([["./w.webp", img(WEBP, "image/webp")]]));
    expect(r.media).toHaveLength(0);
    expect(r.xml).toContain("[圖片:w]");
    expect(r.warnings.join()).toContain("1 張 WebP 圖片無法嵌入 DOCX");
  });

  it("unresolved images still become text with a hint to pick the image folder", async () => {
    const r = await build("![x](./gone.png)");
    expect(r.media).toHaveLength(0);
    expect(r.warnings.join()).toContain("1 張圖片未嵌入 DOCX");
    expect(r.warnings.join()).toContain("圖片資料夾");
  });

  it("works inside table cells and list items", async () => {
    const images = new Map([["./p.png", img(PNG, "image/png")]]);
    const r = await build("| a |\n|---|\n| ![p](./p.png) |\n\n- ![p](./p.png)", images);
    expect(r.xml.match(/<w:drawing>/g)).toHaveLength(2);
    expect(r.xml).toContain("<w:tbl>");
  });

  it("round trip: an exported image is reported as not imported, never silently lost", async () => {
    const out = await exportDocx({ markdown: "文字 ![p](./p.png)", ...base, images: new Map([["./p.png", img(PNG, "image/png")]]) });
    const buf = out.data.buffer.slice(out.data.byteOffset, out.data.byteOffset + out.data.byteLength) as ArrayBuffer;
    const back = await importDocument("x.docx", buf);
    expect(back.markdown).not.toContain("base64");
    expect(back.warnings.join()).toContain("1 張圖片未匯入");
  });
});
