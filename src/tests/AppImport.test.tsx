import { screen, fireEvent, waitFor, act } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { type TestPlatform, makePlatform, renderApp } from "./helpers/platform";


const bytes = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
const editorText = () => EditorView.findFromDOM(document.querySelector<HTMLElement>(".cm-editor")!)!.state.doc.toString();

let platform: TestPlatform;
let files: TestPlatform["files"];

beforeEach(() => {
  platform = makePlatform();
  files = platform.files;
  vi.clearAllMocks();
  localStorage.clear();
});

describe("import flow", () => {
  it("converts an HTML file into a new unsaved Markdown document and shows the report", async () => {
    vi.mocked(files.pickImportFile).mockResolvedValue({
      name: "page.html",
      buffer: bytes('<h1>網頁</h1><script>1</script><p style="color:red">內文</p>'),
    });
    renderApp(platform);
    fireEvent.click(screen.getByRole("button", { name: "匯入" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("page.html");
    expect(dialog).toHaveTextContent("已移除");
    expect(dialog).toHaveTextContent("樣式不會轉為 Markdown");
    fireEvent.click(screen.getByRole("button", { name: "開始編輯" }));

    expect(editorText()).toBe("# 網頁\n\n內文\n");
    expect(screen.getByTitle("page.md")).toHaveTextContent("● page.md"); // dirty marker + new name
    expect(screen.getByText("未儲存")).toBeInTheDocument(); // never silently "clean"
    expect(files.saveFileAs).not.toHaveBeenCalled(); // nothing was written, source untouched
  });

  it("says plainly when no losses were detected", async () => {
    vi.mocked(files.pickImportFile).mockResolvedValue({ name: "a.html", buffer: bytes("<p>簡單</p>") });
    renderApp(platform);
    fireEvent.click(screen.getByRole("button", { name: "匯入" }));
    expect(await screen.findByText(/未偵測到已知的轉換損失/)).toBeInTheDocument();
  });

  it("shows a readable error for unsupported formats and keeps the current document", async () => {
    vi.mocked(files.pickImportFile).mockResolvedValue({ name: "old.rtf", buffer: bytes("{\\rtf1}") });
    renderApp(platform);
    fireEvent.click(screen.getByRole("button", { name: "匯入" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("不支援匯入「old.rtf」");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("未命名.md")).toBeInTheDocument();
  });

  it("does nothing when the picker is cancelled", async () => {
    vi.mocked(files.pickImportFile).mockResolvedValue(null);
    renderApp(platform);
    fireEvent.click(screen.getByRole("button", { name: "匯入" }));
    await waitFor(() => expect(files.pickImportFile).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("opens the import in a new tab and keeps the document you were editing", async () => {
    vi.mocked(files.pickImportFile).mockResolvedValue({ name: "a.html", buffer: bytes("<p>匯入內容</p>") });
    renderApp(platform);
    const view = EditorView.findFromDOM(document.querySelector<HTMLElement>(".cm-editor")!)!;
    act(() => view.dispatch({ changes: { from: 0, insert: "我的草稿" } }));

    fireEvent.click(screen.getByRole("button", { name: "匯入" }));
    fireEvent.click(await screen.findByRole("button", { name: "開始編輯" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(); // nothing was replaced
    expect(editorText()).toBe("匯入內容" + String.fromCharCode(10));

    fireEvent.click(screen.getByTitle("未命名.md")); // the first tab
    expect(editorText()).toBe("我的草稿"); // the draft is still there
  });
});
