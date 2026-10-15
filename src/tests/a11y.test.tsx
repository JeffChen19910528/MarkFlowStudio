import { render, screen, fireEvent, act } from "@testing-library/react";
import axe from "axe-core";
import { EditorView } from "@codemirror/view";
import { App } from "../app/App";

async function violations(root: Element = document.body) {
  const result = await axe.run(root, {
    // jsdom has no layout engine, so colour contrast can't be computed here (checked separately).
    iframes: false, // jsdom cannot message sandboxed frames; the preview iframe carries a title
    rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
  });
  return result.violations.map((v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
}

function type(text: string) {
  const view = EditorView.findFromDOM(document.querySelector<HTMLElement>(".cm-editor")!)!;
  view.dispatch({ changes: { from: view.state.doc.length, insert: text } });
}

beforeEach(() => localStorage.clear());

describe("accessibility (axe)", () => {
  it("main screen with preview and settings panel", async () => {
    render(<App />);
    act(() => type("# 標題\n\n[連結](https://e.com)\n\n| a | b |\n|---|---|\n| 1 | 2 |"));
    expect(await violations()).toEqual([]);
  });

  it("each view mode", async () => {
    render(<App />);
    for (const name of ["編輯", "預覽", "分割"]) {
      fireEvent.click(screen.getByRole("button", { name }));
      expect(await violations(), name).toEqual([]);
    }
  });

  it("export dialog for every format", async () => {
    render(<App />);
    act(() => type("# 標題\n\n內容"));
    fireEvent.click(screen.getByRole("button", { name: "匯出" }));
    for (const label of [/HTML 網頁/, /純文字/, /PDF/, /Word/]) {
      fireEvent.click(screen.getByLabelText(label));
      expect(await violations(), String(label)).toEqual([]);
    }
  });

  it("unsaved-changes prompt", async () => {
    render(<App />);
    act(() => type("x"));
    fireEvent.click(screen.getByRole("button", { name: "新增" }));
    expect(await violations()).toEqual([]);
  });

  it("several tabs, the sidebar outline, and the close-tab prompt", async () => {
    render(<App />);
    const nl = String.fromCharCode(10);
    act(() => type("# 標題" + nl + nl + "## 子標題"));
    fireEvent.click(screen.getByRole("button", { name: "新增" }));
    fireEvent.click(screen.getByRole("button", { name: "新增" }));
    expect(screen.getAllByRole("button", { name: /^關閉 / })).toHaveLength(2);
    expect(await violations()).toEqual([]);
    fireEvent.click(screen.getAllByRole("button", { name: /^關閉 / })[0]);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(await violations()).toEqual([]);
  });

  it("settings panel with a saved custom theme", async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("新主題名稱"), { target: { value: "我的" } });
    fireEvent.click(screen.getByRole("button", { name: "儲存為新主題" }));
    expect(await violations()).toEqual([]);
  });
});
