import { screen, fireEvent, waitFor, act, within } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { type TestPlatform, makePlatform, renderApp } from "./helpers/platform";
import { FileError } from "../shared/errors";
import { MAX_TABS } from "../shared/workspace";


// In-memory stand-in for IndexedDB-backed recent files (real handles are structured-cloneable; test fakes are not).

const handle = (name: string) =>
  ({ name, isSameEntry: async (o: { name: string }) => o.name === name }) as unknown as FileSystemFileHandle;

const view = () => EditorView.findFromDOM(document.querySelector<HTMLElement>(".cm-editor")!)!;
const text = () => view().state.doc.toString();
const type = (t: string) => act(() => view().dispatch({ changes: { from: view().state.doc.length, insert: t } }));
const tabButton = (title: string) => screen.getByTitle(title);
const closeButtons = () => screen.queryAllByRole("button", { name: /^關閉 / });

async function openFile(name: string, body: string, h = handle(name)) {
  vi.mocked(files.openFile).mockResolvedValueOnce({ name, text: body, handle: h });
  await act(async () => void fireEvent.click(screen.getByRole("button", { name: "開啟" })));
}

let platform: TestPlatform;
let files: TestPlatform["files"];

beforeEach(() => {
  platform = makePlatform();
  files = platform.files;
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(files.saveFile).mockImplementation(async (_t, _n, h) => ({ name: h?.name ?? "x.md", handle: h }));
});

describe("multiple documents", () => {
  it("opens files in separate tabs and switches between them", async () => {
    renderApp(platform);
    await openFile("a.md", "甲內容");
    await openFile("b.md", "乙內容");
    expect(closeButtons()).toHaveLength(2); // the empty untitled tab was reused by the first open
    expect(text()).toBe("乙內容");
    fireEvent.click(tabButton("a.md"));
    expect(text()).toBe("甲內容");
    expect(tabButton("a.md")).toHaveAttribute("aria-current", "true");
    expect(tabButton("b.md")).not.toHaveAttribute("aria-current");
  });

  it("keeps each document's edits and shows a dirty marker only on the edited tab", async () => {
    renderApp(platform);
    await openFile("a.md", "甲");
    await openFile("b.md", "乙");
    type("+改");
    expect(tabButton("b.md")).toHaveTextContent("● b.md");
    expect(tabButton("a.md")).not.toHaveTextContent("●");
    fireEvent.click(tabButton("a.md"));
    expect(text()).toBe("甲");
    expect(screen.getByText("已儲存")).toBeInTheDocument();
    fireEvent.click(tabButton("b.md"));
    expect(text()).toBe("乙+改");
    expect(screen.getByText("未儲存")).toBeInTheDocument();
  });

  it("each tab has its own undo history", async () => {
    renderApp(platform);
    await openFile("a.md", "");
    type("甲1");
    await openFile("b.md", "");
    type("乙1");
    fireEvent.click(tabButton("a.md"));
    fireEvent.click(screen.getByRole("button", { name: "復原" }));
    expect(text()).toBe(""); // undid A's typing only
    fireEvent.click(tabButton("b.md"));
    expect(text()).toBe("乙1"); // B untouched
    fireEvent.click(screen.getByRole("button", { name: "復原" }));
    expect(text()).toBe("");
    fireEvent.click(tabButton("a.md"));
    fireEvent.click(screen.getByRole("button", { name: "重做" }));
    expect(text()).toBe("甲1"); // redo history survived the tab switches
  });

  it("opening a file that is already open switches to it and does not discard unsaved edits", async () => {
    renderApp(platform);
    const h = handle("a.md");
    await openFile("a.md", "原文", h);
    type("+未存");
    await openFile("b.md", "乙");
    vi.mocked(files.openFile).mockResolvedValueOnce({ name: "a.md", text: "磁碟上的舊內容", handle: handle("a.md") });
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "開啟" })));
    expect(closeButtons()).toHaveLength(2);
    expect(text()).toBe("原文+未存");
    expect(screen.getByRole("status")).toHaveTextContent("已經開啟");
  });

  it("refuses to open more than the tab limit and says why", async () => {
    renderApp(platform);
    for (let i = 0; i < MAX_TABS; i++) await openFile(`f${i}.md`, `${i}`);
    expect(closeButtons()).toHaveLength(MAX_TABS);
    await openFile("extra.md", "x");
    expect(closeButtons()).toHaveLength(MAX_TABS);
    expect(screen.getByRole("alert")).toHaveTextContent(`最多同時開啟 ${MAX_TABS} 份文件`);
    expect(screen.getByLabelText("新增文件")).toBeEnabled();
    fireEvent.click(screen.getByLabelText("新增文件"));
    expect(screen.getByRole("alert")).toHaveTextContent("最多同時開啟");
  });
});

describe("closing tabs", () => {
  it("closes a clean tab immediately and activates a neighbour", async () => {
    renderApp(platform);
    await openFile("a.md", "甲");
    await openFile("b.md", "乙");
    fireEvent.click(screen.getByRole("button", { name: "關閉 b.md" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(closeButtons()).toHaveLength(1);
    expect(text()).toBe("甲");
  });

  it("asks before closing a dirty tab: 放棄 closes it", async () => {
    renderApp(platform);
    await openFile("a.md", "甲");
    type("改");
    await openFile("b.md", "乙");
    fireEvent.click(screen.getByRole("button", { name: "關閉 a.md" })); // dirty, in the background
    const dlg = screen.getByRole("alertdialog");
    expect(dlg).toHaveTextContent("a.md");
    fireEvent.click(within(dlg).getByRole("button", { name: "放棄變更" }));
    expect(closeButtons()).toHaveLength(1);
    expect(screen.queryByTitle("a.md")).not.toBeInTheDocument();
    expect(files.saveFile).not.toHaveBeenCalled();
  });

  it("儲存 saves that tab's own text and then closes it", async () => {
    renderApp(platform);
    await openFile("a.md", "甲");
    type("改");
    await openFile("b.md", "乙");
    fireEvent.click(screen.getByRole("button", { name: "關閉 a.md" }));
    await act(async () => void fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "儲存" })));
    expect(files.saveFile).toHaveBeenCalledWith("甲改", "a.md", expect.objectContaining({ name: "a.md" }));
    await waitFor(() => expect(screen.queryByTitle("a.md")).not.toBeInTheDocument());
  });

  it("keeps the tab when saving fails or is cancelled", async () => {
    vi.mocked(files.saveFile).mockRejectedValueOnce(new FileError("permission-denied", "沒有權限存取此檔案"));
    renderApp(platform);
    await openFile("a.md", "甲");
    type("改");
    fireEvent.click(screen.getByRole("button", { name: "關閉 a.md" }));
    await act(async () => void fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "儲存" })));
    expect(screen.getByRole("alert")).toHaveTextContent("沒有權限");
    expect(screen.getByTitle("a.md")).toBeInTheDocument();
    expect(text()).toBe("甲改");
  });

  it("closing the last tab leaves one empty untitled document", async () => {
    renderApp(platform);
    await openFile("a.md", "甲");
    fireEvent.click(screen.getByRole("button", { name: "關閉 a.md" }));
    expect(closeButtons()).toHaveLength(1);
    expect(screen.getByTitle("未命名.md")).toBeInTheDocument();
    expect(text()).toBe("");
  });

  it("warns on page unload while any tab (even a background one) has unsaved changes", async () => {
    const add = vi.spyOn(window, "addEventListener");
    renderApp(platform);
    await openFile("a.md", "甲");
    type("改");
    await openFile("b.md", "乙");
    expect(add.mock.calls.some(([t]) => t === "beforeunload")).toBe(true);
    add.mockRestore();
  });
});

describe("autosave with several tabs", () => {
  it("writes every dirty linked tab, including background ones", async () => {
    vi.useFakeTimers();
    try {
      renderApp(platform);
      await openFile("a.md", "甲");
      type("改");
      await openFile("b.md", "乙");
      fireEvent.click(screen.getByLabelText("定時自動儲存"));
      fireEvent.change(screen.getByLabelText("間隔 (秒)"), { target: { value: "5" } });
      await act(async () => void (await vi.advanceTimersByTimeAsync(5500)));
      expect(files.saveFile).toHaveBeenCalledTimes(1);
      expect(files.saveFile).toHaveBeenCalledWith("甲改", "a.md", expect.objectContaining({ name: "a.md" }));
      expect(tabButton("a.md")).not.toHaveTextContent("●");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("outline", () => {
  it("lists headings with their levels and moves the cursor to the clicked one", async () => {
    renderApp(platform);
    await openFile("a.md", "# 一\n\n文字\n\n## 二\n\n更多\n\n### 三\n");
    const outline = screen.getByRole("complementary", { name: "側欄" });
    const items = within(outline).getAllByRole("listitem").filter((li) => ["一", "二", "三"].includes(li.textContent ?? ""));
    expect(items.map((li) => li.textContent)).toEqual(["一", "二", "三"]);
    expect(items[2].style.paddingLeft).toBe("24px"); // H3 is two levels below H1

    fireEvent.click(within(outline).getByRole("button", { name: "二" }));
    const head = view().state.selection.main.head;
    expect(view().state.doc.lineAt(head).text).toBe("## 二");
  });

  it("follows the active tab and says so when there are no headings", async () => {
    renderApp(platform);
    await openFile("a.md", "# 甲標題");
    await openFile("b.md", "沒有標題");
    const outline = screen.getByRole("complementary", { name: "側欄" });
    expect(within(outline).getByText("文件中沒有標題")).toBeInTheDocument();
    fireEvent.click(tabButton("a.md"));
    expect(within(outline).getByRole("button", { name: "甲標題" })).toBeInTheDocument();
  });

  it("the sidebar can be hidden", () => {
    renderApp(platform);
    fireEvent.click(screen.getByRole("button", { name: "側欄" }));
    expect(screen.queryByRole("complementary", { name: "側欄" })).not.toBeInTheDocument();
  });
});

describe("recent files", () => {
  // Recent files exist only where file references can be kept (the File System Access API).
  beforeEach(() => {
    platform = makePlatform({ recentsSupported: true });
    files = platform.files;
    files.saveFile.mockImplementation(async (_t, _n, h) => ({ name: h?.name ?? "x.md", handle: h }));
  });

  it("records opened files, newest first, and reopens one with a click", async () => {
    renderApp(platform);
    await openFile("a.md", "甲");
    await openFile("b.md", "乙");
    const list = () => within(screen.getByRole("complementary", { name: "側欄" }));
    await waitFor(() => expect(list().getByRole("button", { name: "b.md" })).toBeInTheDocument());
    const names = within(screen.getByRole("region", { name: "最近文件" })).getAllByRole("button").map((b) => b.textContent);
    expect(names.slice(0, 2)).toEqual(["b.md", "a.md"]);

    fireEvent.click(screen.getByRole("button", { name: "關閉 a.md" }));
    vi.mocked(files.openFromRef).mockResolvedValueOnce({ name: "a.md", text: "從最近文件開啟", handle: handle("a.md") });
    const recentList = within(screen.getByRole("region", { name: "最近文件" }));
    await act(async () => void fireEvent.click(recentList.getByRole("button", { name: "a.md" })));
    expect(text()).toBe("從最近文件開啟");
  });

  it("drops an entry whose file no longer exists and tells the user", async () => {
    renderApp(platform);
    await openFile("gone.md", "x");
    const section = () => within(screen.getByRole("region", { name: "最近文件" }));
    await waitFor(() => expect(section().getByRole("button", { name: "gone.md" })).toBeInTheDocument());
    vi.mocked(files.openFromRef).mockRejectedValueOnce(new FileError("not-found", "找不到檔案,可能已被移動或刪除"));
    await act(async () => void fireEvent.click(section().getByRole("button", { name: "gone.md" })));
    expect(screen.getByRole("alert")).toHaveTextContent("找不到檔案");
    await waitFor(() => expect(section().getByText("尚無最近文件")).toBeInTheDocument());
    expect(platform.recents.remove).toHaveBeenCalled();
  });

  it("keeps the entry when access is merely denied", async () => {
    renderApp(platform);
    await openFile("a.md", "x");
    const section = () => within(screen.getByRole("region", { name: "最近文件" }));
    await waitFor(() => expect(section().getByRole("button", { name: "a.md" })).toBeInTheDocument());
    vi.mocked(files.openFromRef).mockRejectedValueOnce(new FileError("permission-denied", "需要您授權才能開啟這個檔案"));
    await act(async () => void fireEvent.click(section().getByRole("button", { name: "a.md" })));
    expect(screen.getByRole("alert")).toHaveTextContent("需要您授權");
    expect(section().getByRole("button", { name: "a.md" })).toBeInTheDocument();
    expect(platform.recents.remove).not.toHaveBeenCalled();
  });

  it("clears the list on request", async () => {
    renderApp(platform);
    await openFile("a.md", "x");
    const section = () => within(screen.getByRole("region", { name: "最近文件" }));
    await waitFor(() => expect(section().getByRole("button", { name: "清除最近文件" })).toBeInTheDocument());
    await act(async () => void fireEvent.click(section().getByRole("button", { name: "清除最近文件" })));
    expect(section().getByText("尚無最近文件")).toBeInTheDocument();
  });

  it("is explained as unavailable where file handles cannot be stored", () => {
    platform = makePlatform({ recentsSupported: false });
    renderApp(platform);
    expect(screen.getByText(/無法記住檔案位置/)).toBeInTheDocument();
    expect(platform.recents.list).not.toHaveBeenCalled();
  });
});
