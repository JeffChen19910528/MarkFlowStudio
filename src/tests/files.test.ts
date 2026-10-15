import { openFile, saveFile } from "../files/documents";
import { suggestFileName, validateFileName } from "../files/text";
import { MAX_FILE_BYTES, decodeUtf8 } from "../shared/utf8";
import { FileError } from "../shared/errors";

const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

describe("validateFileName", () => {
  it.each(["a.md", "A.MARKDOWN", "notes.txt"])("accepts %s", (n) => {
    expect(() => validateFileName(n)).not.toThrow();
  });

  it.each(["a.exe", "a.docx", "md", "a.md.exe"])("rejects %s", (n) => {
    expect(() => validateFileName(n)).toThrow(FileError);
  });
});

describe("decodeUtf8", () => {
  it("decodes Traditional Chinese and emoji, stripping a BOM", () => {
    expect(decodeUtf8(enc("﻿繁體中文 😀"))).toBe("繁體中文 😀");
  });

  it("rejects invalid UTF-8 instead of corrupting it", () => {
    const bad = new Uint8Array([0xff, 0xfe, 0xfd]).buffer;
    expect(() => decodeUtf8(bad)).toThrowError(expect.objectContaining({ code: "invalid-encoding" }));
  });

  it("rejects oversize files", () => {
    expect(() => decodeUtf8(new ArrayBuffer(MAX_FILE_BYTES + 1))).toThrowError(
      expect.objectContaining({ code: "too-large" }),
    );
  });
});

describe("suggestFileName", () => {
  it("sanitises illegal characters and adds .md", () => {
    expect(suggestFileName('a/b:c?')).toBe("a_b_c_.md");
  });
  it("keeps allowed extensions and falls back for empty titles", () => {
    expect(suggestFileName("x.txt")).toBe("x.txt");
    expect(suggestFileName("  ")).toBe("未命名.md");
  });
});

function fakeHandle(name: string, content: string, opts: { failWrite?: boolean } = {}) {
  const written: string[] = [];
  const state = { aborted: false, closed: false };
  const handle = {
    name,
    getFile: async () => new File([content], name),
    createWritable: async () => ({
      write: async (t: string) => {
        if (opts.failWrite) throw new DOMException("disk full", "QuotaExceededError");
        written.push(t);
      },
      close: async () => void (state.closed = true),
      abort: async () => void (state.aborted = true),
    }),
  };
  return { handle: handle as unknown as FileSystemFileHandle, written, state };
}

describe("file round trip (File System Access API mocked)", () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).showOpenFilePicker;
  });

  it("save then reopen yields identical content", async () => {
    const text = "# 標題\n\n內容 😀\n";
    const f = fakeHandle("doc.md", "");
    await saveFile(text, "doc.md", f.handle);
    expect(f.written).toEqual([text]);

    const reopened = fakeHandle("doc.md", f.written[0]);
    (window as unknown as Record<string, unknown>).showOpenFilePicker = async () => [reopened.handle];
    const opened = await openFile();
    expect(opened?.text).toBe(text);
  });

  it("returns null when the user cancels the open dialog", async () => {
    (window as unknown as Record<string, unknown>).showOpenFilePicker = async () => {
      throw new DOMException("cancelled", "AbortError");
    };
    expect(await openFile()).toBeNull();
  });

  it("aborts the write and reports an error when saving fails", async () => {
    const f = fakeHandle("doc.md", "", { failWrite: true });
    await expect(saveFile("x", "doc.md", f.handle)).rejects.toBeInstanceOf(FileError);
    expect(f.state.aborted).toBe(true);
    expect(f.state.closed).toBe(false);
  });

  it("maps permission errors to a readable code", async () => {
    (window as unknown as Record<string, unknown>).showOpenFilePicker = async () => {
      throw new DOMException("denied", "NotAllowedError");
    };
    await expect(openFile()).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("rejects an unsupported extension picked in the dialog", async () => {
    const f = fakeHandle("evil.exe", "x");
    (window as unknown as Record<string, unknown>).showOpenFilePicker = async () => [f.handle];
    await expect(openFile()).rejects.toMatchObject({ code: "unsupported-extension" });
  });
});
