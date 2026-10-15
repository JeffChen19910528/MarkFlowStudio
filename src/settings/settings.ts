import { DEFAULT_THEME, type ThemeSettings, sanitizeTheme } from "../themes/themes";
import { DEFAULT_PDF_OPTIONS, type PdfOptions, sanitizePdfOptions } from "../exporters/pdfOptions";
import { EXPORT_FORMAT_IDS, type ExportFormat, type ExportStyle } from "../exporters/types";

export type ViewMode = "edit" | "preview" | "split";

export interface AppSettings {
  /** Working theme currently applied (a built-in, a saved theme, or an edited "custom" copy). */
  theme: ThemeSettings;
  savedThemes: ThemeSettings[];
  viewMode: ViewMode;
  syncScroll: boolean;
  /** Last-used export options, remembered between sessions. */
  exportFormat: ExportFormat;
  exportStyle: ExportStyle;
  pdf: PdfOptions;
  autosave: boolean;
  autosaveSec: number;
}

export const AUTOSAVE_SEC = [5, 600] as const;
export const STORAGE_KEY = "markflow.settings.v1";
export const MAX_SAVED_THEMES = 50;

export const defaultSettings = (): AppSettings => ({
  theme: DEFAULT_THEME,
  savedThemes: [],
  viewMode: "split",
  syncScroll: true,
  exportFormat: "html",
  exportStyle: "print",
  pdf: DEFAULT_PDF_OPTIONS,
  autosave: false,
  autosaveSec: 30,
});

const VIEW_MODES: ViewMode[] = ["edit", "preview", "split"];

/** Never throws: corrupt or missing storage yields defaults. */
export function loadSettings(storage: Pick<Storage, "getItem"> | null = safeStorage()): AppSettings {
  const d = defaultSettings();
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return d;
    const o = JSON.parse(raw) as Record<string, unknown>;
    return {
      theme: sanitizeTheme(o.theme),
      savedThemes: Array.isArray(o.savedThemes)
        ? o.savedThemes.slice(0, MAX_SAVED_THEMES).map((t) => sanitizeTheme(t))
        : [],
      viewMode: VIEW_MODES.includes(o.viewMode as ViewMode) ? (o.viewMode as ViewMode) : d.viewMode,
      syncScroll: typeof o.syncScroll === "boolean" ? o.syncScroll : d.syncScroll,
      exportFormat: EXPORT_FORMAT_IDS.includes(o.exportFormat as ExportFormat) ? (o.exportFormat as ExportFormat) : d.exportFormat,
      pdf: sanitizePdfOptions(o.pdf),
      autosave: typeof o.autosave === "boolean" ? o.autosave : d.autosave,
      autosaveSec:
        typeof o.autosaveSec === "number" && Number.isFinite(o.autosaveSec)
          ? Math.min(AUTOSAVE_SEC[1], Math.max(AUTOSAVE_SEC[0], Math.round(o.autosaveSec)))
          : d.autosaveSec,
      exportStyle: o.exportStyle === "follow" || o.exportStyle === "print" ? o.exportStyle : d.exportStyle,
    };
  } catch {
    return d;
  }
}

export function saveSettings(s: AppSettings, storage: Pick<Storage, "setItem"> | null = safeStorage()): boolean {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(s));
    return storage !== null;
  } catch {
    return false;
  }
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
