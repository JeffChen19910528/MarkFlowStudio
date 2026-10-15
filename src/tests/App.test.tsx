import { screen, fireEvent, waitFor, act } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { type TestPlatform, makePlatform, renderApp } from "./helpers/platform";


function type(text: string) {
  // jsdom can't drive CodeMirror's DOM input, so dispatch through the view instead.
  const view = EditorView.findFromDOM(document.querySelector<HTMLElement>(".cm-editor")!)!;
  view.dispatch({ changes: { from: view.state.doc.length, insert: text } });
}

let platform: TestPlatform;
let files: TestPlatform["files"];

beforeEach(() => {
  platform = makePlatform();
  files = platform.files;
  vi.clearAllMocks();
  localStorage.clear();
});

describe("App", () => {
  it("shows a clean untitled document at start", () => {
    renderApp(platform);
    expect(screen.getByText("未命名.md")).toBeInTheDocument();
    expect(screen.getByText("已儲存")).toBeInTheDocument();
  });

  it("marks the document dirty after typing and clean after saving", async () => {
    vi.mocked(files.saveFileAs).mockResolvedValue({ name: "a.md" });
    renderApp(platform);
    act(() => type("hello"));
    expect(screen.getByText("未儲存")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "儲存" }));
    await waitFor(() => expect(screen.getByText("已儲存")).toBeInTheDocument());
    expect(files.saveFileAs).toHaveBeenCalledWith("hello", "未命名.md");
  });

  it("新增 opens a second tab and leaves unsaved work untouched; closing a dirty tab asks first", () => {
    renderApp(platform);
    act(() => type("x"));
    fireEvent.click(screen.getByRole("button", { name: "新增" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(); // nothing is being discarded
    expect(screen.getAllByRole("button", { name: /^關閉 / })).toHaveLength(2);

    fireEvent.click(screen.getAllByRole("button", { name: /^關閉 / })[0]); // the dirty first tab
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^關閉 / })).toHaveLength(2);
  });

  it("opens a file and shows its name; open errors are shown to the user", async () => {
    vi.mocked(files.openFile).mockResolvedValueOnce({ name: "n.md", text: "內容" });
    renderApp(platform);
    fireEvent.click(screen.getByRole("button", { name: "開啟" }));
    await waitFor(() => expect(screen.getAllByText("n.md").length).toBeGreaterThan(0));

    vi.mocked(files.openFile).mockRejectedValueOnce(new (await import("../shared/errors")).FileError("too-large", "檔案過大"));
    fireEvent.click(screen.getByRole("button", { name: "開啟" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("檔案過大");
  });

  it("undo reverts typed text", () => {
    renderApp(platform);
    act(() => type("abc"));
    expect(screen.getByText("未儲存")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "復原" }));
    expect(screen.getByText("已儲存")).toBeInTheDocument();
  });
});
