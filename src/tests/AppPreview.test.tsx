import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { App } from "../app/App";
import { STORAGE_KEY } from "../settings/settings";

function type(text: string) {
  const view = EditorView.findFromDOM(document.querySelector<HTMLElement>(".cm-editor")!)!;
  view.dispatch({ changes: { from: view.state.doc.length, insert: text } });
}

beforeEach(() => localStorage.clear());

describe("live preview", () => {
  it("defaults to split view and updates the preview as you type", async () => {
    render(<App />);
    expect(screen.getByRole("button", { name: "分割" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("(尚無內容)")).toBeInTheDocument();

    act(() => type("# 你好\n\n**粗體**"));
    const preview = screen.getByRole("region", { name: "預覽" });
    expect(await within(preview).findByRole("heading", { name: "你好" })).toBeInTheDocument();
    expect(preview.querySelector("strong")).toHaveTextContent("粗體");
  });

  it("never executes or injects raw HTML in the preview", async () => {
    render(<App />);
    act(() => type('<img src=x onerror="window.__pwn=1"><script>window.__pwn=1</script>'));
    const preview = screen.getByRole("region", { name: "預覽" });
    await within(preview).findByText(/script/);
    expect(preview.querySelector("img, script")).toBeNull();
    expect((window as unknown as { __pwn?: number }).__pwn).toBeUndefined();
  });

  it("switches between edit, preview and split modes", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "編輯" }));
    expect(screen.queryByRole("region", { name: "預覽" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "預覽" }));
    expect(screen.getByRole("region", { name: "預覽" })).toBeInTheDocument();
    expect(document.querySelector(".editor-pane")).toHaveAttribute("hidden");

    fireEvent.click(screen.getByRole("button", { name: "分割" }));
    expect(document.querySelector(".editor-pane")).not.toHaveAttribute("hidden");
  });

  it("keeps the editor's undo history when hidden in preview mode", () => {
    render(<App />);
    act(() => type("abc"));
    fireEvent.click(screen.getByRole("button", { name: "預覽" }));
    fireEvent.click(screen.getByRole("button", { name: "分割" }));
    fireEvent.click(screen.getByRole("button", { name: "復原" }));
    expect(screen.getByText("已儲存")).toBeInTheDocument();
  });
});

describe("theme settings", () => {
  const root = () => document.querySelector<HTMLElement>(".app")!;

  it("applies the selected theme to the preview immediately", () => {
    render(<App />);
    expect(root().style.getPropertyValue("--preview-bg")).toBe("#ffffff");
    fireEvent.change(screen.getByLabelText("主題"), { target: { value: "midnight-dark" } });
    expect(root().style.getPropertyValue("--preview-bg")).toBe("#14161a");
    expect(root().style.getPropertyValue("--text")).toBe("#d7dae0");
  });

  it("applies font size and keeps values in range", () => {
    render(<App />);
    const size = screen.getByLabelText("字級 (px)");
    fireEvent.change(size, { target: { value: "24" } });
    expect(root().style.getPropertyValue("--font-size")).toBe("24px");

    fireEvent.change(size, { target: { value: "500" } }); // out of range: not committed mid-edit
    expect(root().style.getPropertyValue("--font-size")).toBe("24px");
    fireEvent.blur(size); // clamped on blur
    expect(root().style.getPropertyValue("--font-size")).toBe("32px");
  });

  it("persists settings and restores them after a reload", () => {
    const first = render(<App />);
    fireEvent.change(screen.getByLabelText("主題"), { target: { value: "sepia-reading" } });
    fireEvent.click(screen.getByRole("button", { name: "編輯" }));
    first.unmount();

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).theme.id).toBe("sepia-reading");
    render(<App />);
    expect(root().style.getPropertyValue("--preview-bg")).toBe("#f4ecd8");
    expect(screen.getByRole("button", { name: "編輯" })).toHaveAttribute("aria-pressed", "true");
  });

  it("starts from defaults when stored settings are corrupt", () => {
    localStorage.setItem(STORAGE_KEY, "{broken");
    render(<App />);
    expect(root().style.getPropertyValue("--preview-bg")).toBe("#ffffff");
  });

  it("saves, lists and deletes a custom theme (with confirmation)", () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("字級 (px)"), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText("新主題名稱"), { target: { value: "我的主題" } });
    fireEvent.click(screen.getByRole("button", { name: "儲存為新主題" }));
    expect(screen.getAllByText("我的主題").length).toBeGreaterThan(0);

    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole("button", { name: "刪除" }));
    expect(screen.getAllByText("我的主題").length).toBeGreaterThan(0); // declined
    fireEvent.click(screen.getByRole("button", { name: "刪除" }));
    expect(screen.getByText("尚無自訂主題")).toBeInTheDocument();
    confirm.mockRestore();
  });

  it("warns about low text/background contrast", () => {
    render(<App />);
    expect(screen.queryByText(/對比不足/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("文字色"), { target: { value: "#fafafa" } });
    expect(screen.getByText(/對比不足/)).toBeInTheDocument();
  });

  it("reset restores the default theme", () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("主題"), { target: { value: "rose-note" } });
    fireEvent.click(screen.getByRole("button", { name: "重設為預設值" }));
    expect(root().style.getPropertyValue("--preview-bg")).toBe("#ffffff");
  });
});
