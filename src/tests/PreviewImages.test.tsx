import { render, waitFor, act } from "@testing-library/react";
import { Preview, prepareImages } from "../preview/Preview";

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const PNG = b64("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==");

function dir(files: Record<string, Uint8Array>): FileSystemDirectoryHandle & { touched: ReturnType<typeof vi.fn> } {
  const touched = vi.fn();
  return {
    touched,
    getDirectoryHandle: async (n: string) => {
      touched(n);
      throw new DOMException("no", "NotFoundError");
    },
    getFileHandle: async (n: string) => {
      touched(n);
      const v = files[n];
      if (!v) throw new DOMException("no", "NotFoundError");
      return { getFile: async () => new File([v as BlobPart], n) };
    },
  } as unknown as FileSystemFileHandle & FileSystemDirectoryHandle & { touched: ReturnType<typeof vi.fn> };
}

let n = 0;
const created: string[] = [];
beforeEach(() => {
  n = 0;
  created.length = 0;
  URL.createObjectURL = vi.fn(() => {
    const u = `blob:mock-${++n}`;
    created.push(u);
    return u;
  });
  URL.revokeObjectURL = vi.fn();
});

const img = (c: HTMLElement) => c.querySelector("img")!;
const noop = () => undefined;

describe("prepareImages", () => {
  it("takes src off local and remote images so the browser never fetches them by itself", () => {
    const html = prepareImages('<p><img src="./a.png" alt="甲"><img src="https://e.com/b.png" alt="乙"></p>');
    const box = document.createElement("template");
    box.innerHTML = html;
    const [a, b] = [...box.content.querySelectorAll("img")];
    expect(a.hasAttribute("src")).toBe(false);
    expect(a.getAttribute("data-local-src")).toBe("./a.png");
    expect(a.getAttribute("alt")).toBe("甲");
    expect(b.hasAttribute("src")).toBe(false);
    expect(b.getAttribute("data-blocked-src")).toBe("https://e.com/b.png");
    expect(b.classList.contains("img-blocked")).toBe(true);
  });

  it("leaves embedded data: images alone and skips documents without images", () => {
    const html = '<img src="data:image/png;base64,AAAA" alt="x">';
    expect(prepareImages(html)).toContain('src="data:image/png;base64,AAAA"');
    expect(prepareImages("<p>沒有圖片</p>")).toBe("<p>沒有圖片</p>");
  });
});

describe("Preview images", () => {
  it("without a granted folder: no src (so no request), a clear marker and an explanation", () => {
    const { container } = render(<Preview markdown="![貓](./cat.png)" onElement={noop} />);
    const i = img(container);
    expect(i.hasAttribute("src")).toBe(false);
    expect(i).toHaveClass("img-unresolved");
    expect(i.getAttribute("title")).toContain("圖片資料夾");
    expect(i.getAttribute("alt")).toBe("貓");
  });

  it("with a folder: reads the file and shows it through a blob URL", async () => {
    const d = dir({ "cat.png": PNG });
    const { container } = render(<Preview markdown="![貓](./cat.png)" onElement={noop} imageFolder={d} />);
    await waitFor(() => expect(img(container).getAttribute("src")).toBe("blob:mock-1"));
    expect(img(container)).not.toHaveClass("img-unresolved");
  });

  it("explains why an image could not be shown and never sets a src for it", async () => {
    const d = dir({});
    const { container } = render(<Preview markdown="![x](./nope.png)" onElement={noop} imageFolder={d} />);
    await waitFor(() => expect(img(container)).toHaveClass("img-unresolved"));
    expect(img(container).getAttribute("title")).toContain("找不到檔案");
    expect(img(container).hasAttribute("src")).toBe(false);
  });

  it("refuses paths that climb out of the folder without touching the file system", async () => {
    const d = dir({ "secret.png": PNG });
    const { container } = render(<Preview markdown="![x](../secret.png) ![y](%2e%2e/secret.png)" onElement={noop} imageFolder={d} />);
    await waitFor(() => expect(container.querySelectorAll("img.img-unresolved")).toHaveLength(2));
    expect(container.querySelector("img")!.getAttribute("title")).toContain("路徑不安全");
    expect(d.touched).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("blocks remote images without any attempt to load them", () => {
    const d = dir({});
    const { container } = render(<Preview markdown="![遠端](https://tracker.example/p.png)" onElement={noop} imageFolder={d} />);
    const i = img(container);
    expect(i.hasAttribute("src")).toBe(false);
    expect(i).toHaveClass("img-blocked");
    expect(d.touched).not.toHaveBeenCalled();
  });

  it("keeps embedded data: images", () => {
    const { container } = render(<Preview markdown="![內嵌](data:image/png;base64,iVBORw0KGgo=)" onElement={noop} />);
    expect(img(container).getAttribute("src")).toContain("data:image/png");
  });

  it("does not re-read an unchanged image while you keep typing", async () => {
    const d = dir({ "cat.png": PNG });
    const { container, rerender } = render(<Preview markdown="![貓](./cat.png)" onElement={noop} imageFolder={d} />);
    await waitFor(() => expect(img(container).getAttribute("src")).toBe("blob:mock-1"));
    rerender(<Preview markdown={"![貓](./cat.png)\n\n多打了一些字"} onElement={noop} imageFolder={d} />);
    await waitFor(() => expect(container.textContent).toContain("多打了一些字"));
    await waitFor(() => expect(img(container).getAttribute("src")).toBe("blob:mock-1"));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("re-reads images on request and releases the old blob URLs", async () => {
    const d = dir({ "cat.png": PNG });
    const { container, rerender } = render(<Preview markdown="![貓](./cat.png)" onElement={noop} imageFolder={d} imageReload={0} />);
    await waitFor(() => expect(img(container).getAttribute("src")).toBe("blob:mock-1"));
    rerender(<Preview markdown="![貓](./cat.png)" onElement={noop} imageFolder={d} imageReload={1} />);
    await waitFor(() => expect(img(container).getAttribute("src")).toBe("blob:mock-2"));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-1");
  });

  it("releases blob URLs when unmounted", async () => {
    const d = dir({ "cat.png": PNG });
    const { container, unmount } = render(<Preview markdown="![貓](./cat.png)" onElement={noop} imageFolder={d} />);
    await waitFor(() => expect(img(container).getAttribute("src")).toBe("blob:mock-1"));
    act(() => unmount());
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-1");
  });

  it("switching to another folder drops what the old folder provided", async () => {
    const one = dir({ "cat.png": PNG });
    const two = dir({});
    const { container, rerender } = render(<Preview markdown="![貓](./cat.png)" onElement={noop} imageFolder={one} />);
    await waitFor(() => expect(img(container).getAttribute("src")).toBe("blob:mock-1"));
    rerender(<Preview markdown="![貓](./cat.png)" onElement={noop} imageFolder={two} />);
    await waitFor(() => expect(img(container)).toHaveClass("img-unresolved"));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-1");
  });
});
