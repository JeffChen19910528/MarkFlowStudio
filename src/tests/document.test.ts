import { computeStats, isDirty, markSaved, newDocument, withEdit } from "../shared/document";

describe("document state", () => {
  it("a new or freshly opened document is clean", () => {
    expect(isDirty(newDocument("# 標題"))).toBe(false);
  });

  it("editing makes it dirty; reverting the text makes it clean again", () => {
    const doc = newDocument("abc");
    const edited = withEdit(doc, "abcd");
    expect(isDirty(edited)).toBe(true);
    expect(isDirty(withEdit(edited, "abc"))).toBe(false);
  });

  it("markSaved clears dirty and records the title", () => {
    const saved = markSaved(withEdit(newDocument("a"), "b"), "note.md");
    expect(isDirty(saved)).toBe(false);
    expect(saved.title).toBe("note.md");
    expect(saved.hasFile).toBe(true);
    expect(saved.lastSavedAt).toBeDefined();
  });

  it("edits made while saving stay dirty", () => {
    const doc = withEdit(newDocument("a"), "b");
    const saved = markSaved(withEdit(doc, "bc"), "n.md", "b");
    expect(isDirty(saved)).toBe(true);
    expect(saved.markdown).toBe("bc");
  });
});

describe("computeStats", () => {
  it("handles empty text", () => {
    expect(computeStats("")).toEqual({ chars: 0, words: 0, lines: 0 });
  });

  it("counts CJK characters individually and Latin words by whitespace", () => {
    const s = computeStats("你好 world\nsecond line");
    expect(s.words).toBe(2 + 1 + 2);
    expect(s.lines).toBe(2);
  });

  it("counts emoji as single characters and ignores punctuation-only tokens", () => {
    const s = computeStats("😀 --- ok");
    expect(s.chars).toBe(8);
    expect(s.words).toBe(1);
  });
});
