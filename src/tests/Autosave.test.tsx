import { screen, fireEvent, act } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { type TestPlatform, makePlatform, renderApp } from "./helpers/platform";
import { FileError } from "../shared/errors";
import { STORAGE_KEY, loadSettings } from "../settings/settings";


const handle = { name: "note.md" } as unknown as FileSystemFileHandle;
const view = () => EditorView.findFromDOM(document.querySelector<HTMLElement>(".cm-editor")!)!;
const type = (t: string) => act(() => view().dispatch({ changes: { from: view().state.doc.length, insert: t } }));
const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

async function openLinkedFile(text = "原文") {
  vi.mocked(files.openFile).mockResolvedValueOnce({ name: "note.md", text, handle });
  await act(async () => void fireEvent.click(screen.getByRole("button", { name: "開啟" })));
}

function enableAutosave(seconds = 5) {
  fireEvent.click(screen.getByLabelText("定時自動儲存"));
  fireEvent.change(screen.getByLabelText("間隔 (秒)"), { target: { value: String(seconds) } });
}

let platform: TestPlatform;
let files: TestPlatform["files"];

beforeEach(() => {
  platform = makePlatform();
  files = platform.files;
  vi.useFakeTimers();
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(files.saveFile).mockImplementation(async (_t, _n, h) => ({ name: "note.md", handle: h }));
});
afterEach(() => vi.useRealTimers());

describe("autosave", () => {
  it("is off by default and never writes anything", async () => {
    renderApp(platform);
    await openLinkedFile();
    type("改動");
    await tick(10 * 60 * 1000);
    expect(files.saveFile).not.toHaveBeenCalled();
    expect(screen.getByText("未儲存")).toBeInTheDocument();
  });

  it("writes back to the opened file after the interval and marks the document saved", async () => {
    renderApp(platform);
    await openLinkedFile();
    enableAutosave(5);
    type("改動");
    expect(screen.getByText("未儲存")).toBeInTheDocument();

    await tick(4000);
    expect(files.saveFile).not.toHaveBeenCalled();
    await tick(1500);
    expect(files.saveFile).toHaveBeenCalledTimes(1);
    expect(files.saveFile).toHaveBeenCalledWith("原文改動", "note.md", handle);
    expect(screen.getByText("已儲存")).toBeInTheDocument();
    expect(screen.getByText(/自動儲存 \d/)).toBeInTheDocument();
    expect(files.saveFileAs).not.toHaveBeenCalled(); // autosave never opens a dialog
    expect(screen.queryByText(/^已儲存:/)).not.toBeInTheDocument(); // no banner spam
  });

  it("does not replace undo: the history survives an autosave", async () => {
    renderApp(platform);
    await openLinkedFile("原文");
    enableAutosave(5);
    type("甲");
    await tick(5500);
    expect(screen.getByText("已儲存")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "復原" }));
    expect(view().state.doc.toString()).toBe("原文");
    expect(screen.getByText("未儲存")).toBeInTheDocument(); // undo made it differ from the saved copy again
  });

  it("does nothing when there are no unsaved changes", async () => {
    renderApp(platform);
    await openLinkedFile();
    enableAutosave(5);
    await tick(30_000);
    expect(files.saveFile).not.toHaveBeenCalled();
  });

  it("waits for a first manual save when the document is not linked to a file", async () => {
    renderApp(platform);
    enableAutosave(5);
    type("草稿");
    expect(screen.getByText(/尚未連結到可寫入的檔案/)).toBeInTheDocument();
    expect(screen.getByText("自動儲存:待首次儲存")).toBeInTheDocument();
    await tick(60_000);
    expect(files.saveFile).not.toHaveBeenCalled();
    expect(files.saveFileAs).not.toHaveBeenCalled();
  });

  it("reports failures instead of failing silently, and keeps the document dirty", async () => {
    vi.mocked(files.saveFile).mockRejectedValue(new FileError("permission-denied", "沒有權限存取此檔案"));
    renderApp(platform);
    await openLinkedFile();
    enableAutosave(5);
    type("改動");
    await tick(5500);
    expect(screen.getByRole("alert")).toHaveTextContent("沒有權限存取此檔案");
    expect(screen.getByText("未儲存")).toBeInTheDocument();
  });

  it("stops when switched off", async () => {
    renderApp(platform);
    await openLinkedFile();
    enableAutosave(5);
    fireEvent.click(screen.getByLabelText("定時自動儲存"));
    type("改動");
    await tick(30_000);
    expect(files.saveFile).not.toHaveBeenCalled();
  });

  it("persists the setting and clamps bad stored values", () => {
    renderApp(platform);
    enableAutosave(5);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toMatchObject({ autosave: true, autosaveSec: 5 });
    const mk = (v: unknown) => loadSettings({ getItem: () => JSON.stringify({ autosave: true, autosaveSec: v }) });
    expect(mk(1).autosaveSec).toBe(5);
    expect(mk(99999).autosaveSec).toBe(600);
    expect(mk("x").autosaveSec).toBe(30);
    expect(mk(NaN).autosaveSec).toBe(30);
  });
});

describe("shortcuts dialog", () => {
  it("lists the real shortcuts, is a labelled dialog, and closes with Escape", () => {
    renderApp(platform);
    fireEvent.click(screen.getByRole("button", { name: "快捷鍵" }));
    const dialog = screen.getByRole("dialog", { name: "快捷鍵" });
    for (const t of ["儲存", "另存新檔", "復原", "重做", "搜尋／取代", "找下一個"]) {
      expect(dialog).toHaveTextContent(t);
    }
    expect(screen.getByText("Ctrl+S")).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
