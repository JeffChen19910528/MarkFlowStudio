import { act, fireEvent, screen, within } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { getLanguage, htmlLang, isUntitledTitle, setLanguage, t } from "../i18n";
import { en } from "../i18n/en";
import { zhTW } from "../i18n/zhTW";
import { buildExportFileName } from "../exporters/fileName";
import { htmlExporter } from "../exporters/html";
import { txtExporter } from "../exporters/txt";
import { DEFAULT_THEME } from "../themes/themes";
import { FileError } from "../shared/errors";
import { decodeUtf8 } from "../shared/utf8";
import { newDocument } from "../shared/document";
import { relocalizeUntitled } from "../shared/workspace";
import { makePlatform, renderApp } from "./helpers/platform";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const HAN = /\p{Script=Han}/u;

describe("message catalogues", () => {
  it("English defines exactly the keys Chinese does", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zhTW).sort());
  });

  it("both languages use the same {placeholders} for every message", () => {
    const mismatches = Object.keys(zhTW).filter((k) => {
      const key = k as keyof typeof zhTW;
      return placeholders(zhTW[key]).join() !== placeholders(en[key]).join();
    });
    expect(mismatches).toEqual([]);
  });

  it("no message is empty, and English text contains no Chinese apart from the language name", () => {
    for (const [k, v] of Object.entries(en)) {
      expect(v.trim(), k).not.toBe("");
      if (k !== "lang.zh-TW") expect(HAN.test(v), `${k}: ${v}`).toBe(false);
    }
    for (const [k, v] of Object.entries(zhTW)) expect(v.trim(), k).not.toBe("");
  });
});

describe("t()", () => {
  it("fills placeholders and leaves unknown ones visible", () => {
    expect(t("action.saved", { name: "a.md" })).toBe("已儲存:a.md");
    setLanguage("en", false);
    expect(t("action.saved", { name: "a.md" })).toBe("Saved: a.md");
    expect(t("action.saved")).toBe("Saved: {name}");
    expect(t("action.saved", { name: "a & b" })).toBe("Saved: a & b");
  });

  it("remembers the choice and sets the page language", () => {
    setLanguage("en");
    expect(localStorage.getItem("markflow.language")).toBe("en");
    expect(document.documentElement.lang).toBe("en");
    setLanguage("zh-TW");
    expect(document.documentElement.lang).toBe("zh-Hant");
    expect(htmlLang("en")).toBe("en");
  });

  it("recognises default document names in either language", () => {
    for (const name of ["未命名.md", "未命名 3.md", "Untitled.md", "Untitled 12.md"]) expect(isUntitledTitle(name), name).toBe(true);
    for (const name of ["notes.md", "Untitled.txt", "未命名x.md"]) expect(isUntitledTitle(name), name).toBe(false);
  });
});

describe("detecting the language", () => {
  const withBrowserLanguage = async (lang: string, stored?: string) => {
    vi.resetModules();
    localStorage.clear();
    if (stored) localStorage.setItem("markflow.language", stored);
    vi.spyOn(navigator, "language", "get").mockReturnValue(lang);
    const fresh = await import("../i18n");
    return fresh.getLanguage();
  };
  afterEach(() => vi.restoreAllMocks());

  it("follows the browser: any Chinese gives Traditional Chinese, everything else English", async () => {
    expect(await withBrowserLanguage("zh-TW")).toBe("zh-TW");
    expect(await withBrowserLanguage("zh-CN")).toBe("zh-TW");
    expect(await withBrowserLanguage("en-US")).toBe("en");
    expect(await withBrowserLanguage("fr-FR")).toBe("en");
  });

  it("a saved choice wins over the browser language, and a bad saved value is ignored", async () => {
    expect(await withBrowserLanguage("zh-TW", "en")).toBe("en");
    expect(await withBrowserLanguage("en-US", "zh-TW")).toBe("zh-TW");
    expect(await withBrowserLanguage("en-US", "klingon")).toBe("en");
  });
});

describe("text produced outside components follows the language", () => {
  it("file-name errors, import limits and converter warnings", () => {
    setLanguage("en", false);
    expect(() => buildExportFileName("", ".html")).toThrow("Enter a file name");
    expect(() => buildExportFileName("CON", ".html")).toThrow(/reserved/);
    expect(() => decodeUtf8(new ArrayBuffer(6 * 1024 * 1024))).toThrow(/too large/);
    const warned = txtExporter.export!({ markdown: "![x](a.png)", title: "t.md", theme: DEFAULT_THEME, style: "print" });
    expect(warned.warnings.join()).toMatch(/alt text/);
    setLanguage("zh-TW", false);
    expect(() => buildExportFileName("", ".html")).toThrow("請輸入檔名");
  });

  it("exported HTML declares its language and uses a translated fallback title", () => {
    setLanguage("en", false);
    const out = htmlExporter.export!({ markdown: "text", title: "", theme: DEFAULT_THEME, style: "print" });
    expect(out.content).toContain('<html lang="en">');
    expect(out.content).toContain("<title>Untitled</title>");
    setLanguage("zh-TW", false);
    expect(htmlExporter.export!({ markdown: "text", title: "", theme: DEFAULT_THEME, style: "print" }).content).toContain('<html lang="zh-Hant">');
  });

  it("exporter labels are looked up when read", () => {
    expect(htmlExporter.label).toContain("HTML 網頁");
    setLanguage("en", false);
    expect(htmlExporter.label).toBe("HTML page (.html)");
  });

  it("FileError messages keep the language they were created in", () => {
    setLanguage("en", false);
    const e = new FileError("not-found", t("file.notFound"));
    setLanguage("zh-TW", false);
    expect(e.message).toMatch(/not found/i);
    expect(getLanguage()).toBe("zh-TW");
  });
});

describe("switching the language in the app", () => {
  const view = () => EditorView.findFromDOM(document.querySelector<HTMLElement>(".cm-editor")!)!;
  const choose = (value: string) => act(() => void fireEvent.change(screen.getByRole("combobox", { name: /語言|Language/ }), { target: { value } }));

  it("re-labels the toolbar, tab bar, status bar and sidebar at once, and back again", () => {
    renderApp(makePlatform());
    expect(screen.getByRole("button", { name: "儲存" })).toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: "主要工具列" })).toBeInTheDocument();

    choose("en");
    expect(screen.queryByRole("button", { name: "儲存" })).toBeNull();
    for (const name of ["New", "Open", "Import", "Save", "Save as", "Export", "Undo", "Redo", "Find / Replace", "Shortcuts"]) {
      expect(screen.getByRole("button", { name }), name).toBeInTheDocument();
    }
    expect(screen.getByRole("toolbar", { name: "Main toolbar" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Open documents" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Sidebar" })).toBeInTheDocument();
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.getByText(/\d+ words/)).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en");
    expect(screen.getByRole("combobox", { name: "Language" })).toHaveValue("en");

    choose("zh-TW");
    expect(screen.getByRole("button", { name: "儲存" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("zh-Hant");
  });

  it("changes the editor's accessible name without losing the text", () => {
    renderApp(makePlatform());
    act(() => view().dispatch({ changes: { from: 0, insert: "hello" } }));
    choose("en");
    expect(document.querySelector(".cm-content")).toHaveAttribute("aria-label", "Markdown editor");
    expect(view().state.doc.toString()).toBe("hello");
    choose("zh-TW");
    expect(document.querySelector(".cm-content")).toHaveAttribute("aria-label", "Markdown 編輯區");
  });

  it("shows dialogs in English, including the export dialog and its warnings", async () => {
    renderApp(makePlatform());
    act(() => view().dispatch({ changes: { from: 0, insert: "# Title\n\n![pic](img/a.png)" } }));
    choose("en");
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Export" })));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Export" })).toBeInTheDocument();
    expect(within(dialog).getByText("HTML page (.html)")).toBeInTheDocument();
    expect(within(dialog).getByText(/Print style/)).toBeInTheDocument();
    expect(await within(dialog).findByText(/use relative or local paths/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Choose location and export" })).toBeInTheDocument();
    expect(dialog.textContent).not.toMatch(HAN);
  });

  it("names new documents in the current language and numbers them", async () => {
    renderApp(makePlatform());
    choose("en");
    act(() => view().dispatch({ changes: { from: 0, insert: "x" } }));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "New" })));
    const titles = [...document.querySelectorAll(".tab-main")].map((b) => b.textContent?.replace("● ", ""));
    expect(titles).toHaveLength(2);
    expect(titles).toEqual(["Untitled.md", "Untitled 2.md"]);
  });

  it("the whole English interface has no leftover Chinese", () => {
    renderApp(makePlatform());
    choose("en");
    const ui = document.querySelector(".app")!.cloneNode(true) as HTMLElement;
    ui.querySelectorAll(".lang-select, .cm-editor, .preview").forEach((n) => n.remove());
    expect(ui.textContent ?? "").not.toMatch(HAN);
    const labels = [...ui.querySelectorAll("[aria-label],[title]")].map((n) => `${n.getAttribute("aria-label") ?? ""}${n.getAttribute("title") ?? ""}`);
    expect(labels.join("|")).not.toMatch(HAN);
  });
});

describe("renaming default-named documents on a language change", () => {
  const tab = (title: string, extra: object = {}) => ({ doc: newDocument("", title), ...extra });
  it("renames only unsaved untitled tabs, keeps numbers, and keeps names unique", () => {
    const saved = { doc: newDocument("x", "notes.md", true) };
    const ws = { tabs: [tab("未命名.md"), tab("未命名 2.md"), saved, tab("Untitled.md")], activeId: "" };
    setLanguage("en", false);
    const out = relocalizeUntitled(ws);
    expect(out.tabs.map((x) => x.doc.title)).toEqual(["Untitled.md", "Untitled 2.md", "notes.md", "Untitled 3.md"]);
    expect(out.tabs[2]).toBe(saved);
    expect(relocalizeUntitled(out)).toBe(out);
  });
  it("leaves a tab that is linked to a file alone, even if it has a default-looking name", () => {
    const ws = { tabs: [tab("未命名.md", { handle: { name: "未命名.md", isSameEntry: async () => false } })], activeId: "" };
    setLanguage("en", false);
    expect(relocalizeUntitled(ws)).toBe(ws);
  });
});
