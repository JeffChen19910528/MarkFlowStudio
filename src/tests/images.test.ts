import {
  ImageError,
  MAX_IMAGES,
  MAX_IMAGE_BYTES,
  MAX_TOTAL_IMAGE_BYTES,
  isLocalImageSrc,
  normalizeImagePath,
  resolveImage,
  resolveImages,
  sniffImage,
  toDataUri,
} from "../images";
import { localImageSrcs } from "../markdown/imageRefs";

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const PNG = b64("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==");
const GIF = b64("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7");
const JPEG = b64("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=");
const WEBP_LOSSLESS = b64("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==");
const WEBP_LOSSY = b64("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA");

/** RIFF/WEBP with a VP8X header for a 100x50 image. */
function webpExtended(): Uint8Array {
  const b = new Uint8Array(30);
  b.set([..."RIFF"].map((c) => c.charCodeAt(0)), 0);
  b.set([..."WEBP"].map((c) => c.charCodeAt(0)), 8);
  b.set([..."VP8X"].map((c) => c.charCodeAt(0)), 12);
  b[24] = 99; // width-1
  b[27] = 49; // height-1
  return b;
}

type Tree = { [name: string]: Tree | Uint8Array };
function dir(tree: Tree): FileSystemDirectoryHandle {
  return {
    getDirectoryHandle: async (n: string) => {
      const v = tree[n];
      if (!v || ArrayBuffer.isView(v)) throw new DOMException("no dir", "NotFoundError");
      return dir(v as Tree);
    },
    getFileHandle: async (n: string) => {
      const v = tree[n];
      if (!v) throw new DOMException("no file", "NotFoundError");
      if (!ArrayBuffer.isView(v)) throw new DOMException("is a dir", "TypeMismatchError");
      return { getFile: async () => new File([v as BlobPart], n) };
    },
  } as unknown as FileSystemDirectoryHandle;
}

describe("isLocalImageSrc", () => {
  it.each(["a.png", "./a.png", "../a.png", "pics/a.png", "pics/中文 圖.png"])("treats %s as local", (s) => {
    expect(isLocalImageSrc(s)).toBe(true);
  });
  it.each(["", "  ", "https://e.com/a.png", "http://e.com/a.png", "data:image/png;base64,AA", "blob:x", "file:///a.png", "/abs/a.png", "//host/a.png", "javascript:x", "#frag", "C:/a.png"])(
    "treats %j as not local",
    (s) => {
      expect(isLocalImageSrc(s)).toBe(false);
    },
  );
  it("handles null and undefined", () => {
    expect(isLocalImageSrc(null)).toBe(false);
    expect(isLocalImageSrc(undefined)).toBe(false);
  });
});

describe("normalizeImagePath", () => {
  it("returns folder-relative segments", () => {
    expect(normalizeImagePath("a.png")).toEqual(["a.png"]);
    expect(normalizeImagePath("./pics//a.png")).toEqual(["pics", "a.png"]);
    expect(normalizeImagePath("pics/sub/../a.png")).toEqual(["pics", "a.png"]);
  });

  it("decodes percent-encoding and drops query/fragment", () => {
    expect(normalizeImagePath("pics/%E4%B8%AD%E6%96%87.png?x=1#y")).toEqual(["pics", "中文.png"]);
    expect(normalizeImagePath("a%20b.png")).toEqual(["a b.png"]);
  });

  it.each([
    "../a.png",
    "pics/../../a.png",
    "%2e%2e/a.png",
    "pics/%2e%2e/%2e%2e/a.png",
    "pics\\a.png",
    "a%5Cb.png",
    "a%00.png",
    "a%0A.png",
    "%E0%A4%A.png", // invalid UTF-8 escape
    "/etc/passwd",
    "https://e.com/a.png",
    "",
    ".",
    "./",
  ])("rejects unsafe or empty path %j", (s) => {
    expect(normalizeImagePath(s)).toBeNull();
  });
});

describe("sniffImage", () => {
  it("reads type and size of each supported format from the bytes", () => {
    expect(sniffImage(PNG)).toEqual({ mime: "image/png", width: 1, height: 1 });
    expect(sniffImage(GIF)).toEqual({ mime: "image/gif", width: 1, height: 1 });
    expect(sniffImage(JPEG)).toEqual({ mime: "image/jpeg", width: 1, height: 1 });
    expect(sniffImage(WEBP_LOSSLESS)).toEqual({ mime: "image/webp", width: 1, height: 1 });
    expect(sniffImage(WEBP_LOSSY)).toEqual({ mime: "image/webp", width: 1, height: 1 });
    expect(sniffImage(webpExtended())).toEqual({ mime: "image/webp", width: 100, height: 50 });
  });

  it("reads real dimensions, not just 1x1", () => {
    const png = new Uint8Array(PNG);
    new DataView(png.buffer).setUint32(16, 640);
    new DataView(png.buffer).setUint32(20, 480);
    expect(sniffImage(png)).toMatchObject({ width: 640, height: 480 });
  });

  it.each([
    ["text", new TextEncoder().encode("hello world, not an image at all....")],
    ["html", new TextEncoder().encode("<html><script>alert(1)</script></html>...")],
    ["svg", new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>......')],
    ["empty", new Uint8Array(0)],
    ["truncated png", PNG.slice(0, 12)],
    ["truncated jpeg", JPEG.slice(0, 6)],
  ])("rejects %s", (_n, bytes) => {
    expect(sniffImage(bytes)).toBeNull();
  });
});

describe("resolveImage", () => {
  const root = dir({ "a.png": PNG, pics: { "b.jpg": JPEG, deep: { "c.gif": GIF, "d.webp": WEBP_LOSSLESS } }, "notes.txt": new TextEncoder().encode("x") });

  it("reads files from the folder and from nested folders", async () => {
    expect((await resolveImage(root, "a.png")).mime).toBe("image/png");
    expect((await resolveImage(root, "./pics/b.jpg")).mime).toBe("image/jpeg");
    expect((await resolveImage(root, "pics/deep/c.gif")).mime).toBe("image/gif");
    expect((await resolveImage(root, "pics/deep/../deep/d.webp")).mime).toBe("image/webp");
    expect((await resolveImage(root, "a.png")).bytes).toEqual(PNG);
  });

  const code = async (src: string, r = root) => resolveImage(r, src).then(() => "ok", (e) => (e as ImageError).code);

  it("refuses paths that leave the folder, before touching the file system", async () => {
    const spy = vi.fn();
    const watched = { getDirectoryHandle: spy, getFileHandle: spy } as unknown as FileSystemDirectoryHandle;
    for (const src of ["../a.png", "pics/../../a.png", "%2e%2e/a.png", "/a.png", "https://e.com/a.png"]) {
      expect(await code(src, watched)).toBe("unsafe-path");
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it("reports missing files, folders used as files, and missing folders", async () => {
    expect(await code("nope.png")).toBe("not-found");
    expect(await code("pics.png")).toBe("not-found");
    expect(await code("missing/a.png")).toBe("not-found");
    expect(await code("pics/b.jpg/extra.png")).toBe("not-found");
  });

  it("rejects unsupported extensions without reading the file", async () => {
    for (const src of ["notes.txt", "a.svg", "a.exe", "a", "a.png.exe", "a.html"]) {
      expect(await code(src)).toBe("unsupported-type");
    }
  });

  it("trusts the bytes, not the extension: a text file named .png is rejected", async () => {
    const fake = dir({ "evil.png": new TextEncoder().encode("<script>alert(1)</script> not really a picture") });
    expect(await code("evil.png", fake)).toBe("not-an-image");
  });

  it("uses the real type when the extension lies about a valid image", async () => {
    const lying = dir({ "photo.png": JPEG });
    expect((await resolveImage(lying, "photo.png")).mime).toBe("image/jpeg");
  });

  it("rejects oversize files and absurd pixel counts", async () => {
    const big = dir({ "big.png": new Uint8Array(MAX_IMAGE_BYTES + 1) });
    expect(await code("big.png", big)).toBe("too-large");
    const huge = new Uint8Array(PNG);
    new DataView(huge.buffer).setUint32(16, 20000);
    new DataView(huge.buffer).setUint32(20, 20000);
    expect(await code("huge.png", dir({ "huge.png": huge }))).toBe("too-large");
  });

  it("maps permission errors", async () => {
    const denied = {
      getFileHandle: async () => {
        throw new DOMException("no", "NotAllowedError");
      },
    } as unknown as FileSystemDirectoryHandle;
    expect(await code("a.png", denied)).toBe("denied");
  });

  it("handles unicode and spaces in names", async () => {
    const r = dir({ "我的 圖片.png": PNG });
    expect((await resolveImage(r, "%E6%88%91%E7%9A%84%20%E5%9C%96%E7%89%87.png")).mime).toBe("image/png");
  });
});

describe("resolveImages", () => {
  it("returns what loaded and describes what did not, never throwing", async () => {
    const root = dir({ "a.png": PNG });
    const r = await resolveImages(root, ["a.png", "missing.png", "../x.png", "a.png"]);
    expect([...r.images.keys()]).toEqual(["a.png"]);
    expect(r.failures.map((f) => f.src)).toEqual(["missing.png", "../x.png"]);
    expect(r.failures[0].message).toContain("找不到檔案");
    expect(r.failures[1].message).toContain("路徑不安全");
  });

  it("enforces the image count limit", async () => {
    const tree: Tree = {};
    for (let i = 0; i < MAX_IMAGES + 3; i++) tree[`i${i}.png`] = PNG;
    const r = await resolveImages(dir(tree), Object.keys(tree));
    expect(r.images.size).toBe(MAX_IMAGES);
    expect(r.failures).toHaveLength(3);
    expect(r.failures[0].message).toContain("數量超過上限");
  });

  it("enforces the total size limit", async () => {
    const chunk = new Uint8Array(PNG.length + 4_000_000);
    chunk.set(PNG);
    const n = Math.floor(MAX_TOTAL_IMAGE_BYTES / chunk.length) + 2;
    const tree: Tree = {};
    for (let i = 0; i < n; i++) tree[`i${i}.png`] = chunk;
    const r = await resolveImages(dir(tree), Object.keys(tree));
    expect(r.failures.length).toBeGreaterThan(0);
    expect(r.failures.at(-1)!.message).toContain("總大小");
    const total = [...r.images.values()].reduce((s, i) => s + i.bytes.length, 0);
    expect(total).toBeLessThanOrEqual(MAX_TOTAL_IMAGE_BYTES);
  });
});

describe("localImageSrcs / toDataUri", () => {
  it("collects only local images, as they appear after Markdown normalisation", () => {
    const md = "![a](./a.png) ![b](https://e.com/b.png) ![c](data:image/png;base64,AA) ![d](pics/中文.png) ![a](./a.png)";
    expect(localImageSrcs(md)).toEqual(["./a.png", "pics/%E4%B8%AD%E6%96%87.png"]);
  });

  it("encodes bytes as a base64 data URI that decodes back", () => {
    const uri = toDataUri({ bytes: new Uint8Array(PNG), mime: "image/png", width: 1, height: 1 });
    expect(uri.startsWith("data:image/png;base64,")).toBe(true);
    expect(b64(uri.split(",")[1])).toEqual(PNG);
  });

  it("handles images larger than the encoding chunk", () => {
    const big = new Uint8Array(100_000).map((_, i) => i % 251);
    const uri = toDataUri({ bytes: big as Uint8Array<ArrayBuffer>, mime: "image/png", width: 1, height: 1 });
    expect(b64(uri.split(",")[1])).toEqual(big);
  });
});
