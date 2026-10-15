import { screen, fireEvent, waitFor, act, within } from "@testing-library/react";
import { type TestPlatform, makePlatform, renderApp } from "./helpers/platform";


const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const PNG = b64("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==");

function folder(name: string, present: Record<string, Uint8Array>) {
  return {
    name,
    getDirectoryHandle: async () => {
      throw new DOMException("no", "NotFoundError");
    },
    getFileHandle: async (n: string) => {
      if (!present[n]) throw new DOMException("no", "NotFoundError");
      return { getFile: async () => new File([present[n] as BlobPart], n) };
    },
  } as unknown as FileSystemDirectoryHandle;
}

const DOC = "# 圖文\n\n![貓](./cat.png)\n\n![無](./gone.png)\n";
const sidebar = () => within(screen.getByRole("complementary", { name: "側欄" }));
const previewImgs = () => [...document.querySelectorAll<HTMLImageElement>(".preview img")];

async function openDoc(text = DOC, name = "doc.md") {
  vi.mocked(files.openFile).mockResolvedValueOnce({ name, text });
  await act(async () => void fireEvent.click(screen.getByRole("button", { name: "開啟" })));
}

async function pickFolder(d = folder("imgs", { "cat.png": PNG })) {
  vi.mocked(files.pickImageFolder).mockResolvedValueOnce(d);
  await act(async () => void fireEvent.click(sidebar().getByRole("button", { name: /選擇圖片資料夾/ })));
}

let n = 0;
let platform: TestPlatform;
let files: TestPlatform["files"];

beforeEach(() => {
  platform = makePlatform();
  files = platform.files;
  vi.clearAllMocks();
  vi.mocked(files.hasFolderPicker).mockReturnValue(true);
  localStorage.clear();
  n = 0;
  URL.createObjectURL = vi.fn(() => `blob:app-${++n}`);
  URL.revokeObjectURL = vi.fn();
});

describe("image folder", () => {
  it("tells you when the document has relative images and no folder yet; the preview does not load them", async () => {
    renderApp(platform);
    await openDoc();
    expect(sidebar().getByText(/文件中有 2 張相對路徑圖片/)).toBeInTheDocument();
    expect(previewImgs()).toHaveLength(2);
    expect(previewImgs().every((i) => !i.hasAttribute("src"))).toBe(true);
    expect(previewImgs().every((i) => i.classList.contains("img-unresolved"))).toBe(true);
  });

  it("shows images found in the chosen folder and marks the ones that are missing", async () => {
    renderApp(platform);
    await openDoc();
    await pickFolder();
    await waitFor(() => expect(previewImgs()[0].getAttribute("src")).toBe("blob:app-1"));
    expect(previewImgs()[1]).toHaveClass("img-unresolved");
    expect(previewImgs()[1].getAttribute("title")).toContain("找不到檔案");
    expect(sidebar().getByText("已選擇:imgs")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("已選擇圖片資料夾:imgs");
  });

  it("does nothing when the folder picker is cancelled", async () => {
    renderApp(platform);
    await openDoc();
    vi.mocked(files.pickImageFolder).mockResolvedValueOnce(null);
    await act(async () => void fireEvent.click(sidebar().getByRole("button", { name: /選擇圖片資料夾/ })));
    expect(sidebar().queryByText(/已選擇/)).not.toBeInTheDocument();
  });

  it("can be cleared", async () => {
    renderApp(platform);
    await openDoc();
    await pickFolder();
    fireEvent.click(sidebar().getByRole("button", { name: "取消選擇" }));
    expect(sidebar().queryByText(/已選擇/)).not.toBeInTheDocument();
    await waitFor(() => expect(previewImgs()[0]).toHaveClass("img-unresolved"));
  });

  it("belongs to one document: another tab starts without it", async () => {
    renderApp(platform);
    await openDoc(DOC, "a.md");
    await pickFolder();
    await openDoc("# 另一份\n\n![貓](./cat.png)\n", "b.md");
    expect(sidebar().queryByText(/已選擇/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle("a.md"));
    expect(sidebar().getByText("已選擇:imgs")).toBeInTheDocument();
  });

  it("explains itself where the browser cannot pick folders", async () => {
    vi.mocked(files.hasFolderPicker).mockReturnValue(false);
    renderApp(platform);
    await openDoc();
    expect(sidebar().getByText(/無法選擇資料夾/)).toBeInTheDocument();
    expect(sidebar().queryByRole("button", { name: /選擇圖片資料夾/ })).not.toBeInTheDocument();
  });
});

describe("exports use the chosen folder", () => {
  async function openExport(format: RegExp) {
    fireEvent.click(screen.getByRole("button", { name: "匯出" }));
    fireEvent.click(screen.getByLabelText(format));
  }

  it("HTML: embeds found images and lists the ones it could not load, with the reason", async () => {
    renderApp(platform);
    await openDoc();
    await pickFolder();
    await openExport(/HTML 網頁/);
    const frame = await screen.findByTitle("匯出預覽");
    await waitFor(() => expect(frame.getAttribute("srcdoc")).toContain("data:image/png;base64,"));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText(/圖片「.\/gone.png」無法載入:在所選資料夾中找不到檔案/)).toBeInTheDocument();
    expect(frame.getAttribute("srcdoc")).toContain("./gone.png");
  });

  it("HTML without a folder still works and points at the folder option", async () => {
    renderApp(platform);
    await openDoc();
    await openExport(/HTML 網頁/);
    const dialog = within(screen.getByRole("dialog"));
    expect(await dialog.findByText(/圖片資料夾/)).toBeInTheDocument();
    expect(screen.getByTitle("匯出預覽").getAttribute("srcdoc")).not.toContain("data:image/png");
  });

  it("DOCX: waits for the images, then reports only what is still missing", async () => {
    renderApp(platform);
    await openDoc();
    await pickFolder();
    await openExport(/Word/);
    expect(await screen.findByText(/二進位檔案,無法在此預覽/)).toBeInTheDocument();
    expect(screen.getByText(/1 張圖片未嵌入 DOCX/)).toBeInTheDocument(); // gone.png only; cat.png is embedded
    expect(screen.getByRole("button", { name: "選擇位置並匯出" })).toBeEnabled();
  });

  it("PDF: sends a print document that contains the embedded image", async () => {
    renderApp(platform);
    await openDoc();
    await pickFolder();
    await openExport(/PDF/);
    const go = screen.getByRole("button", { name: /開啟列印對話框/ });
    await waitFor(() => expect(go).toBeEnabled());
    await act(async () => void fireEvent.click(go));
    const html = platform.printer.printHtml.mock.calls[0][0];
    expect(html).toContain("data:image/png;base64,");
    expect(html).toContain("[圖片:無]");
    expect(html).not.toContain("[圖片:貓]");
  });

  it("plain text does not read the folder at all", async () => {
    // The dialog opens on the last-used format, so remember plain text first.
    localStorage.setItem("markflow.settings.v1", JSON.stringify({ exportFormat: "txt" }));
    const d = folder("imgs", { "cat.png": PNG });
    const spy = vi.spyOn(d, "getFileHandle");
    renderApp(platform);
    await openDoc();
    await pickFolder(d);
    spy.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "匯出" }));
    expect(await screen.findByLabelText("匯出預覽")).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });
});
