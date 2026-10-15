import {
  BUILTIN_THEMES,
  DEFAULT_THEME,
  LIMITS,
  contrastRatio,
  sanitizeTheme,
  themeToCssVars,
} from "../themes/themes";
import { STORAGE_KEY, defaultSettings, loadSettings, saveSettings } from "../settings/settings";
import {
  deleteSavedTheme,
  duplicateSavedTheme,
  editTheme,
  renameSavedTheme,
  resetTheme,
  saveAsNewTheme,
  selectTheme,
  updateSavedTheme,
} from "../settings/themeOps";

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe("built-in themes", () => {
  it("provides the seven named themes with valid, readable colours", () => {
    expect(BUILTIN_THEMES.map((t) => t.name)).toEqual([
      "Paper White",
      "Midnight Dark",
      "Sepia Reading",
      "Mint Calm",
      "Ocean Blue",
      "Rose Note",
      "Minimal Gray",
    ]);
    for (const t of BUILTIN_THEMES) {
      expect(sanitizeTheme(t, DEFAULT_THEME)).toEqual(t);
      expect(contrastRatio(t.textColor, t.previewBackground)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.linkColor, t.previewBackground)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("sanitizeTheme boundaries", () => {
  it("clamps numeric values to the allowed ranges", () => {
    const lo = sanitizeTheme({ fontSizePx: 1, lineHeight: 0, paragraphSpacingPx: -5, contentMaxWidthPx: 1 });
    expect(lo.fontSizePx).toBe(LIMITS.fontSizePx[0]);
    expect(lo.lineHeight).toBe(LIMITS.lineHeight[0]);
    expect(lo.paragraphSpacingPx).toBe(0);
    expect(lo.contentMaxWidthPx).toBe(LIMITS.contentMaxWidthPx[0]);
    const hi = sanitizeTheme({ fontSizePx: 999, lineHeight: 99, contentMaxWidthPx: 1e9 });
    expect(hi.fontSizePx).toBe(32);
    expect(hi.lineHeight).toBe(3);
    expect(hi.contentMaxWidthPx).toBe(1600);
  });

  it("falls back for NaN, wrong types, bad colours and unknown fonts", () => {
    const t = sanitizeTheme({ fontSizePx: NaN, textColor: "red; background:url(x)", fontFamily: "Comic", headingScales: "x" });
    expect(t.fontSizePx).toBe(DEFAULT_THEME.fontSizePx);
    expect(t.textColor).toBe(DEFAULT_THEME.textColor);
    expect(t.fontFamily).toBe(DEFAULT_THEME.fontFamily);
    expect(t.headingScales).toEqual(DEFAULT_THEME.headingScales);
  });

  it("accepts null/garbage input", () => {
    expect(sanitizeTheme(null)).toEqual(DEFAULT_THEME);
    expect(sanitizeTheme(42)).toEqual(DEFAULT_THEME);
  });
});

describe("themeToCssVars", () => {
  it("exposes colours, typography and all six heading scales", () => {
    const v = themeToCssVars(DEFAULT_THEME);
    expect(v["--preview-bg"]).toBe("#ffffff");
    expect(v["--font-size"]).toBe("16px");
    for (let i = 1; i <= 6; i++) expect(v[`--h${i}-scale`]).toBeDefined();
  });
});

describe("settings persistence", () => {
  it("round-trips through storage", () => {
    const s = saveAsNewTheme(editTheme(defaultSettings(), { fontSizePx: 20 }), "我的主題");
    const store = memory();
    expect(saveSettings(s, store)).toBe(true);
    expect(loadSettings(store)).toEqual(s);
  });

  it.each(["{not json", "null", '{"theme":5,"savedThemes":"x","viewMode":"zzz"}', "[]"])(
    "recovers from corrupt data: %s",
    (raw) => {
      const store = memory();
      store.setItem(STORAGE_KEY, raw);
      const s = loadSettings(store);
      expect(s.theme).toBeDefined();
      expect(["edit", "preview", "split"]).toContain(s.viewMode);
      expect(Array.isArray(s.savedThemes)).toBe(true);
    },
  );

  it("reports failure when storage is unavailable or throws", () => {
    expect(saveSettings(defaultSettings(), null)).toBe(false);
    expect(
      saveSettings(defaultSettings(), {
        setItem: () => {
          throw new Error("quota");
        },
      }),
    ).toBe(false);
    expect(loadSettings(null)).toEqual(defaultSettings());
  });
});

describe("theme operations", () => {
  it("editing a built-in produces an unsaved Custom copy; the built-in is untouched", () => {
    const s = editTheme(selectTheme(defaultSettings(), BUILTIN_THEMES[1]), { headingColor: "#ff0000" });
    expect(s.theme.id).toBe("custom");
    expect(s.theme.headingColor).toBe("#ff0000");
    expect(BUILTIN_THEMES[1].headingColor).toBe("#ffffff");
  });

  it("rejects invalid edits instead of storing them", () => {
    const s = editTheme(defaultSettings(), { fontSizePx: 500, linkColor: "javascript:1" });
    expect(s.theme.fontSizePx).toBe(32);
    expect(s.theme.linkColor).toBe(DEFAULT_THEME.linkColor);
  });

  it("save / update / rename / duplicate / delete saved themes", () => {
    let s = saveAsNewTheme(editTheme(defaultSettings(), { fontSizePx: 18 }), "  A  ");
    expect(s.savedThemes.map((t) => t.name)).toEqual(["A"]);
    const id = s.theme.id;

    s = editTheme(s, { fontSizePx: 22 });
    expect(s.theme.id).toBe(id); // saved themes keep identity while being edited
    expect(s.savedThemes[0].fontSizePx).toBe(18);
    s = updateSavedTheme(s);
    expect(s.savedThemes[0].fontSizePx).toBe(22);

    s = renameSavedTheme(s, id, "B");
    expect(s.theme.name).toBe("B");
    s = duplicateSavedTheme(s, id);
    expect(s.savedThemes.map((t) => t.name)).toEqual(["B", "B 副本"]);
    expect(new Set(s.savedThemes.map((t) => t.id)).size).toBe(2);

    s = deleteSavedTheme(s, id);
    expect(s.savedThemes.map((t) => t.name)).toEqual(["B 副本"]);
    expect(s.theme.id).toBe("custom"); // active theme survives as an unsaved copy
    expect(s.theme.fontSizePx).toBe(22);
  });

  it("ignores empty names", () => {
    const s = defaultSettings();
    expect(saveAsNewTheme(s, "   ")).toBe(s);
  });

  it("reset restores defaults", () => {
    expect(resetTheme(editTheme(defaultSettings(), { fontSizePx: 30 })).theme).toEqual(DEFAULT_THEME);
  });
});
