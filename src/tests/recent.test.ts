import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import type { FileRef } from "../shared/fileRef";
import { MAX_RECENT, addRecent, clearRecent, listRecent, removeRecent } from "../files/recent";

// Real FileSystemFileHandles are structured-cloneable; plain data stands in for them here.
const h = (name: string) => ({ name, kind: "file" }) as unknown as FileSystemFileHandle;
const sameName = async (a: FileRef, b: FileRef) => a.name === b.name;
const add = (name: string, now: number) => addRecent(h(name), { now, isSame: sameName });

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe("recent files", () => {
  it("starts empty", async () => {
    expect(await listRecent()).toEqual([]);
  });

  it("lists newest first and stores only name, time and handle (no content or path)", async () => {
    await add("a.md", 1);
    await add("b.md", 2);
    const list = await listRecent();
    expect(list.map((r) => r.name)).toEqual(["b.md", "a.md"]);
    expect(Object.keys(list[0]).sort()).toEqual(["handle", "id", "name", "openedAt"]);
  });

  it("moves an already-listed file to the top instead of duplicating it", async () => {
    await add("a.md", 1);
    await add("b.md", 2);
    await add("a.md", 3);
    const list = await listRecent();
    expect(list.map((r) => r.name)).toEqual(["a.md", "b.md"]);
    expect(list).toHaveLength(2);
  });

  it(`keeps only the ${MAX_RECENT} most recent`, async () => {
    for (let i = 0; i < MAX_RECENT + 5; i++) await add(`f${i}.md`, i);
    const list = await listRecent();
    expect(list).toHaveLength(MAX_RECENT);
    expect(list[0].name).toBe(`f${MAX_RECENT + 4}.md`);
    expect(list.at(-1)!.name).toBe("f5.md");
  });

  it("removes one entry and clears all", async () => {
    await add("a.md", 1);
    await add("b.md", 2);
    const [first] = await listRecent();
    await removeRecent(first.id);
    expect((await listRecent()).map((r) => r.name)).toEqual(["a.md"]);
    await clearRecent();
    expect(await listRecent()).toEqual([]);
  });

  it("never throws when storage is unavailable", async () => {
    globalThis.indexedDB = { open: () => { throw new Error("blocked"); } } as unknown as IDBFactory;
    await expect(listRecent()).resolves.toEqual([]);
    await expect(addRecent(h("a.md"))).resolves.toBeUndefined();
    await expect(removeRecent("x")).resolves.toBeUndefined();
    await expect(clearRecent()).resolves.toBeUndefined();
  });
});
