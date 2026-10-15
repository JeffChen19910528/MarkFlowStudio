export type FontKey = "system" | "sans" | "serif" | "mono";

export const FONT_STACKS: Record<FontKey, string> = {
  system: 'system-ui, "Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif',
  sans: '"Noto Sans TC", "Microsoft JhengHei", "PingFang TC", Arial, sans-serif',
  serif: '"Noto Serif TC", "PMingLiU", "Songti TC", Georgia, serif',
  mono: 'ui-monospace, "Cascadia Mono", Consolas, "Noto Sans Mono CJK TC", monospace',
};

export const FONT_KEYS: readonly FontKey[] = ["system", "sans", "serif", "mono"];

export interface ThemeSettings {
  id: string;
  name: string;
  editorBackground: string;
  previewBackground: string;
  textColor: string;
  headingColor: string;
  linkColor: string;
  codeBackground: string;
  fontFamily: FontKey;
  fontSizePx: number;
  lineHeight: number;
  paragraphSpacingPx: number;
  contentMaxWidthPx: number;
  /** H1–H6 size multipliers relative to fontSizePx. */
  headingScales: [number, number, number, number, number, number];
}

export const LIMITS = {
  fontSizePx: [10, 32],
  lineHeight: [1, 3],
  paragraphSpacingPx: [0, 48],
  contentMaxWidthPx: [400, 1600],
  headingScale: [0.8, 3],
} as const;

export const CUSTOM_ID = "custom";
const DEFAULT_SCALES: ThemeSettings["headingScales"] = [2, 1.6, 1.3, 1.15, 1, 0.9];

const base = {
  fontFamily: "system" as FontKey,
  fontSizePx: 16,
  lineHeight: 1.7,
  paragraphSpacingPx: 14,
  contentMaxWidthPx: 800,
  headingScales: DEFAULT_SCALES,
};

function theme(
  id: string,
  name: string,
  bg: string,
  text: string,
  heading: string,
  link: string,
  code: string,
  editorBg = bg,
): ThemeSettings {
  return {
    ...base,
    id,
    name,
    editorBackground: editorBg,
    previewBackground: bg,
    textColor: text,
    headingColor: heading,
    linkColor: link,
    codeBackground: code,
  };
}

export const BUILTIN_THEMES: readonly ThemeSettings[] = [
  theme("paper-white", "Paper White", "#ffffff", "#1f2328", "#0b1f3a", "#0b5fff", "#f3f4f6"),
  theme("midnight-dark", "Midnight Dark", "#14161a", "#d7dae0", "#ffffff", "#7cb7ff", "#222630"),
  theme("sepia-reading", "Sepia Reading", "#f4ecd8", "#4b3b2a", "#2e2012", "#8a4b0f", "#e8dcc0"),
  theme("mint-calm", "Mint Calm", "#eaf6ef", "#24402f", "#17492d", "#1c7a4d", "#d6ecde"),
  theme("ocean-blue", "Ocean Blue", "#eaf3fb", "#1d3347", "#0b3d6b", "#0a6fc2", "#d4e6f6"),
  theme("rose-note", "Rose Note", "#fbeef1", "#4a2a33", "#8a2342", "#b8325a", "#f5dbe2"),
  theme("minimal-gray", "Minimal Gray", "#f2f2f2", "#2b2b2b", "#111111", "#444444", "#e2e2e2"),
];

export const DEFAULT_THEME = BUILTIN_THEMES[0];

export function customFrom(source: ThemeSettings): ThemeSettings {
  return { ...source, id: CUSTOM_ID, name: "Custom" };
}

const HEX = /^#[0-9a-f]{6}$/i;
const clamp = (n: unknown, [lo, hi]: readonly [number, number] | readonly number[], fallback: number) =>
  typeof n === "number" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;

/** Coerce arbitrary (e.g. persisted) data into a valid theme, falling back per field. */
export function sanitizeTheme(input: unknown, fallback: ThemeSettings = DEFAULT_THEME): ThemeSettings {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const color = (k: keyof ThemeSettings) => (typeof o[k] === "string" && HEX.test(o[k] as string) ? (o[k] as string) : (fallback[k] as string));
  const scales = Array.isArray(o.headingScales) ? o.headingScales : [];
  return {
    id: typeof o.id === "string" && o.id ? o.id.slice(0, 64) : fallback.id,
    name: typeof o.name === "string" && o.name.trim() ? o.name.trim().slice(0, 40) : fallback.name,
    editorBackground: color("editorBackground"),
    previewBackground: color("previewBackground"),
    textColor: color("textColor"),
    headingColor: color("headingColor"),
    linkColor: color("linkColor"),
    codeBackground: color("codeBackground"),
    fontFamily: o.fontFamily as FontKey in FONT_STACKS ? (o.fontFamily as FontKey) : fallback.fontFamily,
    fontSizePx: clamp(o.fontSizePx, LIMITS.fontSizePx, fallback.fontSizePx),
    lineHeight: clamp(o.lineHeight, LIMITS.lineHeight, fallback.lineHeight),
    paragraphSpacingPx: clamp(o.paragraphSpacingPx, LIMITS.paragraphSpacingPx, fallback.paragraphSpacingPx),
    contentMaxWidthPx: clamp(o.contentMaxWidthPx, LIMITS.contentMaxWidthPx, fallback.contentMaxWidthPx),
    headingScales: fallback.headingScales.map((d, i) => clamp(scales[i], LIMITS.headingScale, d)) as ThemeSettings["headingScales"],
  };
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #rrggbb colours. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function themeToCssVars(t: ThemeSettings): Record<string, string> {
  const vars: Record<string, string> = {
    "--editor-bg": t.editorBackground,
    "--preview-bg": t.previewBackground,
    "--text": t.textColor,
    "--heading": t.headingColor,
    "--link": t.linkColor,
    "--code-bg": t.codeBackground,
    "--content-font": FONT_STACKS[t.fontFamily],
    "--font-size": `${t.fontSizePx}px`,
    "--line-height": String(t.lineHeight),
    "--para-gap": `${t.paragraphSpacingPx}px`,
    "--max-width": `${t.contentMaxWidthPx}px`,
  };
  t.headingScales.forEach((s, i) => (vars[`--h${i + 1}-scale`] = String(s)));
  return vars;
}
