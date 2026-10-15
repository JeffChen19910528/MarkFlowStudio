import { newDocument, withEdit } from "../shared/document";
import {
  MAX_TABS,
  type Tab,
  activate,
  activeTab,
  anyDirty,
  canAddTab,
  closeTab,
  findTab,
  findTabByHandle,
  isPristine,
  newWorkspace,
  openTab,
  updateTab,
} from "../shared/workspace";

const tab = (text = "", title = "a.md", handle?: FileSystemFileHandle): Tab => ({
  doc: newDocument(text, title, true),
  handle,
});
const ids = (ws: ReturnType<typeof newWorkspace>) => ws.tabs.map((t) => t.doc.title);

describe("workspace", () => {
  it("starts with one pristine untitled tab", () => {
    const ws = newWorkspace();
    expect(ws.tabs).toHaveLength(1);
    expect(isPristine(activeTab(ws))).toBe(true);
    expect(anyDirty(ws)).toBe(false);
  });

  it("opening into a pristine workspace replaces the empty tab instead of leaving it behind", () => {
    const ws = openTab(newWorkspace(), tab("x", "a.md"));
    expect(ids(ws)).toEqual(["a.md"]);
    expect(activeTab(ws).doc.title).toBe("a.md");
  });

  it("appends and activates when the active tab is in use", () => {
    let ws = openTab(newWorkspace(), tab("x", "a.md"));
    ws = openTab(ws, tab("y", "b.md"));
    expect(ids(ws)).toEqual(["a.md", "b.md"]);
    expect(activeTab(ws).doc.title).toBe("b.md");
  });

  it("an edited untitled tab is no longer pristine", () => {
    const ws = newWorkspace();
    const edited = updateTab(ws, ws.activeId, (t) => ({ ...t, doc: withEdit(t.doc, "草稿") }));
    expect(isPristine(activeTab(edited))).toBe(false);
    expect(ids(openTab(edited, tab("y", "b.md")))).toEqual(["未命名.md", "b.md"]);
  });

  it("enforces the tab limit but still reuses a pristine tab", () => {
    let ws = newWorkspace();
    for (let i = 0; i < MAX_TABS; i++) ws = openTab(ws, tab("x", `f${i}.md`));
    expect(ws.tabs).toHaveLength(MAX_TABS);
    expect(canAddTab(ws)).toBe(false);
    expect(openTab(ws, tab("z", "extra.md"))).toBe(ws);
    const withPristine: typeof ws = { tabs: [{ doc: newDocument() }], activeId: "" };
    withPristine.activeId = withPristine.tabs[0].doc.id;
    expect(canAddTab(withPristine)).toBe(true);
  });

  it("activate ignores unknown ids", () => {
    const ws = openTab(openTab(newWorkspace(), tab("x", "a.md")), tab("y", "b.md"));
    const first = ws.tabs[0].doc.id;
    expect(activate(ws, first).activeId).toBe(first);
    expect(activate(ws, "nope")).toBe(ws);
  });

  it("closing the active tab activates its neighbour (next, else previous)", () => {
    let ws = newWorkspace();
    for (const n of ["a", "b", "c"]) ws = openTab(ws, tab(n, `${n}.md`));
    const [a, b, c] = ws.tabs.map((t) => t.doc.id);
    ws = activate(ws, b);
    ws = closeTab(ws, b);
    expect(ws.activeId).toBe(c); // same index → next tab
    ws = closeTab(ws, c);
    expect(ws.activeId).toBe(a); // no next → previous
  });

  it("closing a background tab keeps the active tab", () => {
    let ws = openTab(openTab(newWorkspace(), tab("x", "a.md")), tab("y", "b.md"));
    const [a, b] = ws.tabs.map((t) => t.doc.id);
    ws = closeTab(ws, a);
    expect(ws.activeId).toBe(b);
    expect(ids(ws)).toEqual(["b.md"]);
  });

  it("closing the last tab leaves a fresh empty document, never zero tabs", () => {
    let ws = openTab(newWorkspace(), tab("x", "a.md"));
    ws = closeTab(ws, ws.activeId);
    expect(ws.tabs).toHaveLength(1);
    expect(isPristine(activeTab(ws))).toBe(true);
  });

  it("closing an unknown tab changes nothing", () => {
    const ws = newWorkspace();
    expect(closeTab(ws, "nope")).toBe(ws);
  });

  it("anyDirty reflects any tab, not just the active one", () => {
    let ws = openTab(newWorkspace(), tab("x", "a.md"));
    const first = ws.activeId;
    ws = openTab(ws, tab("y", "b.md"));
    ws = updateTab(ws, first, (t) => ({ ...t, doc: withEdit(t.doc, "changed") }));
    expect(activeTab(ws).doc.title).toBe("b.md");
    expect(anyDirty(ws)).toBe(true);
    expect(findTab(ws, first)).toBeDefined();
  });

  it("finds an already-open file by handle identity and tolerates handle errors", async () => {
    const mk = (same: boolean | "throw") =>
      ({ isSameEntry: async () => (same === "throw" ? Promise.reject(new Error("x")) : same) }) as unknown as FileSystemFileHandle;
    const a = tab("x", "a.md", mk(false));
    const b = tab("y", "b.md", mk(true));
    const c = tab("z", "c.md", mk("throw"));
    const ws = { tabs: [a, b, c], activeId: a.doc.id };
    expect(await findTabByHandle(ws, mk(true))).toBe(b);
    expect(await findTabByHandle({ tabs: [a, c], activeId: a.doc.id }, mk(true))).toBeUndefined();
    expect(await findTabByHandle({ tabs: [tab("n", "n.md")], activeId: "x" }, mk(true))).toBeUndefined();
  });
});

describe("untitled document names", () => {
  it("numbers new untitled documents so they can be told apart, reusing freed numbers", async () => {
    const { nextUntitledTitle } = await import("../shared/workspace");
    let ws = newWorkspace();
    expect(nextUntitledTitle(ws)).toBe("未命名 2.md");
    ws = { tabs: [...ws.tabs, { doc: newDocument("x", "未命名 2.md") }, { doc: newDocument("y", "未命名 3.md") }], activeId: ws.activeId };
    expect(nextUntitledTitle(ws)).toBe("未命名 4.md");
    const gap = { ...ws, tabs: ws.tabs.filter((t) => t.doc.title !== "未命名 2.md") };
    expect(nextUntitledTitle(gap)).toBe("未命名 2.md");
    expect(nextUntitledTitle({ tabs: [{ doc: newDocument("z", "a.md") }], activeId: "" })).toBe("未命名.md");
  });

  it("numbered untitled tabs still count as pristine when empty", () => {
    expect(isPristine({ doc: newDocument("", "未命名 7.md") })).toBe(true);
    expect(isPristine({ doc: newDocument("", "報告.md") })).toBe(false);
    expect(isPristine({ doc: newDocument("x", "未命名 2.md") })).toBe(false);
  });
});
