import { screen, fireEvent, waitFor, act } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { browserPlatformWithFakePrinter, renderApp } from "./helpers/platform";
import type { Platform } from "../platform/types";
import { STORAGE_KEY } from "../settings/settings";


const w = window as unknown as Record<string, unknown>;

function type(text: string) {
  const view = EditorView.findFromDOM(document.querySelector<HTMLElement>(".cm-editor")!)!;
  view.dispatch({ changes: { from: view.state.doc.length, insert: text } });
}

function saveHandle() {
  const written: string[] = [];
  return {
    written,
    handle: {
      name: "out.html",
      isSameEntry: async () => false,
      getFile: async () => ({ size: 5 }),
      createWritable: async () => ({
        write: async (t: string) => void written.push(t),
        close: async () => undefined,
        abort: async () => undefined,
      }),
    },
  };
}

// Real browser file writing (the tests provide window.showSaveFilePicker); only the print dialog is faked.
let platform: Platform;
let printer: ReturnType<typeof browserPlatformWithFakePrinter>["printer"];

beforeEach(() => {
  ({ platform, printer } = browserPlatformWithFakePrinter());
  localStorage.clear();
  });
afterEach(() => delete w.showSaveFilePicker);

describe("export dialog", () => {
  it("lists every supported format and no placeholder entries", () => {
    renderApp(platform);
    fireEvent.click(screen.getByRole("button", { name: "匯出" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    for (const label of [/HTML 網頁/, /純文字/, /PDF/, /Word \(\.docx\)/]) {
      expect(screen.getByLabelText(label)).toBeEnabled();
    }
    expect(screen.queryByText(/尚未支援/)).not.toBeInTheDocument();
  });

  describe("DOCX", () => {
    it("generates asynchronously, validates, and reports losses before exporting", async () => {
      renderApp(platform);
      act(() => type("# 標題\n\n![圖](a.png)"));
      fireEvent.click(screen.getByRole("button", { name: "匯出" }));
      fireEvent.click(screen.getByLabelText(/Word \(\.docx\)/));
      const go = screen.getByRole("button", { name: "選擇位置並匯出" });
      expect(go).toBeDisabled(); // not ready until the file has been generated
      expect(await screen.findByText(/二進位檔案,無法在此預覽/)).toBeInTheDocument();
      expect(screen.getByText(/張圖片未嵌入 DOCX/)).toBeInTheDocument();
      expect(go).toBeEnabled();
    });

    it("writes a real zip (PK header) to the chosen file with the .docx name", async () => {
      const writes: unknown[] = [];
      let pickerOptions: { suggestedName?: string } = {};
      w.showSaveFilePicker = async (o: { suggestedName?: string }) => {
        pickerOptions = o;
        return {
          name: "out.docx",
          isSameEntry: async () => false,
          getFile: async () => ({ size: 100 }),
          createWritable: async () => ({
            write: async (d: unknown) => void writes.push(d),
            close: async () => undefined,
            abort: async () => undefined,
          }),
        };
      };
      renderApp(platform);
      act(() => type("# 標題\n\n內容"));
      fireEvent.click(screen.getByRole("button", { name: "匯出" }));
      fireEvent.click(screen.getByLabelText(/Word \(\.docx\)/));
      await screen.findByText(/二進位檔案/);
      fireEvent.click(screen.getByRole("button", { name: "選擇位置並匯出" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(pickerOptions.suggestedName).toBe("未命名.docx");
      const data = writes[0] as Uint8Array;
      expect(data).toBeInstanceOf(Uint8Array);
      expect([data[0], data[1]]).toEqual([0x50, 0x4b]);
      expect(screen.getByRole("status")).toHaveTextContent("已匯出:out.docx");
    });

    it("stays disabled for an empty document", () => {
      renderApp(platform);
      fireEvent.click(screen.getByRole("button", { name: "匯出" }));
      fireEvent.click(screen.getByLabelText(/Word \(\.docx\)/));
      expect(screen.getByRole("button", { name: "選擇位置並匯出" })).toBeDisabled();
      expect(screen.getByText(/文件是空的/)).toBeInTheDocument();
    });
  });

  it("blocks export of an empty document", () => {
    renderApp(platform);
    fireEvent.click(screen.getByRole("button", { name: "匯出" }));
    expect(screen.getByText(/文件是空的/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "選擇位置並匯出" })).toBeDisabled();
  });

  it("validates the file name before enabling export", () => {
    renderApp(platform);
    act(() => type("# hi"));
    fireEvent.click(screen.getByRole("button", { name: "匯出" }));
    const name = screen.getByLabelText(/^檔名/);
    const go = screen.getByRole("button", { name: "選擇位置並匯出" });
    expect(go).toBeEnabled();
    fireEvent.change(name, { target: { value: "bad/name" } });
    expect(go).toBeDisabled();
    expect(screen.getByText(/檔名不可包含/)).toBeVisible();
    fireEvent.change(name, { target: { value: "good" } });
    expect(go).toBeEnabled();
  });

  it("exports HTML to the chosen file, shows success, and remembers the choice", async () => {
    const { handle, written } = saveHandle();
    w.showSaveFilePicker = vi.fn(async () => handle);
    renderApp(platform);
    act(() => type("# 標題"));
    fireEvent.click(screen.getByRole("button", { name: "匯出" }));
    fireEvent.click(screen.getByLabelText(/跟隨目前主題/));
    fireEvent.click(screen.getByRole("button", { name: "選擇位置並匯出" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent("已匯出:out.html");
    expect(written[0]).toContain("<h1>標題</h1>");
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.exportFormat).toBe("html");
    expect(saved.exportStyle).toBe("follow");
    // exporting does not mark the document saved or change it
    expect(screen.getByText("未儲存")).toBeInTheDocument();
  });

  it("shows plain-text output in the preview and exports TXT", async () => {
    const { handle, written } = saveHandle();
    w.showSaveFilePicker = vi.fn(async () => handle);
    renderApp(platform);
    act(() => type("# 標題\n\n**粗**"));
    fireEvent.click(screen.getByRole("button", { name: "匯出" }));
    fireEvent.click(screen.getByLabelText(/純文字/));
    expect(screen.getByLabelText("匯出預覽").textContent).toBe("標題\n\n粗\n");
    fireEvent.click(screen.getByRole("button", { name: "選擇位置並匯出" }));
    await waitFor(() => expect(written).toEqual(["標題\n\n粗\n"]));
  });

  it("keeps the dialog open and reports the reason when writing fails", async () => {
    w.showSaveFilePicker = async () => {
      throw new DOMException("denied", "NotAllowedError");
    };
    renderApp(platform);
    act(() => type("x"));
    fireEvent.click(screen.getByRole("button", { name: "匯出" }));
    fireEvent.click(screen.getByRole("button", { name: "選擇位置並匯出" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("沒有權限");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  describe("PDF via browser print", () => {
    const openPdf = () => {
      renderApp(platform);
      act(() => type("# 報告\n\n內容"));
      fireEvent.click(screen.getByRole("button", { name: "匯出" }));
      fireEvent.click(screen.getByLabelText(/PDF/));
    };

    it("shows PDF options and a print-based action, not a file picker", () => {
      openPdf();
      expect(screen.getByRole("group", { name: "PDF 設定" })).toBeInTheDocument();
      expect(screen.getByLabelText("頁面尺寸")).toHaveValue("A4");
      expect(screen.getByRole("button", { name: /開啟列印對話框/ })).toBeEnabled();
      expect(screen.getByText(/列印版預覽/)).toBeInTheDocument();
      expect(screen.getByText(/實際分頁請以瀏覽器列印預覽為準/)).toBeInTheDocument();
    });

    it("sends the print document with the chosen options to the print function, and reports honestly", async () => {
      openPdf();
      fireEvent.change(screen.getByLabelText("頁面尺寸"), { target: { value: "Letter" } });
      fireEvent.change(screen.getByLabelText("方向"), { target: { value: "landscape" } });
      fireEvent.change(screen.getByLabelText("頁首文字"), { target: { value: "內部資料" } });
      fireEvent.click(screen.getByRole("button", { name: /開啟列印對話框/ }));

      await waitFor(() => expect(printer.printHtml).toHaveBeenCalledTimes(1));
      const html = printer.printHtml.mock.calls[0][0];
      expect(html).toContain("size:279.4mm 215.9mm");
      expect(html).toContain('@top-center{content:"內部資料"');
      expect(html).toContain("<h1>報告</h1>");

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      // never claims the PDF was saved
      expect(screen.getByRole("status")).toHaveTextContent("無法確認是否已完成儲存");
      expect(screen.getByRole("status")).not.toHaveTextContent("已匯出");
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).pdf.pageSize).toBe("Letter");
    });

    it("blocks printing when margins leave no content area", () => {
      openPdf();
      fireEvent.change(screen.getByLabelText("左邊距"), { target: { value: "100" } });
      fireEvent.change(screen.getByLabelText("右邊距"), { target: { value: "100" } });
      expect(screen.getByRole("alert")).toHaveTextContent("左右邊距過大");
      expect(screen.getByRole("button", { name: /開啟列印對話框/ })).toBeDisabled();
    });

    it("shows an error and keeps the dialog open when printing fails", async () => {
      printer.printHtml.mockRejectedValueOnce(new Error("無法建立列印視窗"));
      openPdf();
      fireEvent.click(screen.getByRole("button", { name: /開啟列印對話框/ }));
      expect(await screen.findByText(/無法建立列印視窗/)).toBeInTheDocument();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  it("closes on cancel without writing", () => {
    const picker = vi.fn();
    w.showSaveFilePicker = picker;
    renderApp(platform);
    fireEvent.click(screen.getByRole("button", { name: "匯出" }));
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(picker).not.toHaveBeenCalled();
  });
});
