/** Pure operations on the working theme and the user's saved themes (no UI, no storage). */
import { t } from "../i18n";
import { BUILTIN_THEMES, CUSTOM_ID, DEFAULT_THEME, type ThemeSettings, customFrom, sanitizeTheme } from "../themes/themes";
import { type AppSettings, MAX_SAVED_THEMES } from "./settings";

export function newThemeId(): string {
  return `user-${crypto.randomUUID()}`;
}

const isSavedId = (id: string) => id.startsWith("user-");

export const selectTheme = (s: AppSettings, theme: ThemeSettings): AppSettings => ({
  ...s,
  theme: sanitizeTheme(theme, theme),
});

/** Editing a built-in theme turns the working copy into "Custom"; saved themes keep their identity. */
export function editTheme(s: AppSettings, patch: Partial<ThemeSettings>): AppSettings {
  const keep = isSavedId(s.theme.id);
  const merged = { ...s.theme, ...patch, id: keep ? s.theme.id : CUSTOM_ID, name: keep ? s.theme.name : "Custom" };
  return { ...s, theme: sanitizeTheme(merged, s.theme) };
}

export const resetTheme = (s: AppSettings): AppSettings => ({ ...s, theme: DEFAULT_THEME });

export function saveAsNewTheme(s: AppSettings, name: string): AppSettings {
  const clean = name.trim().slice(0, 40);
  if (!clean || s.savedThemes.length >= MAX_SAVED_THEMES) return s;
  const saved = { ...s.theme, id: newThemeId(), name: clean };
  return { ...s, theme: saved, savedThemes: [...s.savedThemes, saved] };
}

export function updateSavedTheme(s: AppSettings): AppSettings {
  if (!s.savedThemes.some((t) => t.id === s.theme.id)) return s;
  return { ...s, savedThemes: s.savedThemes.map((t) => (t.id === s.theme.id ? s.theme : t)) };
}

export function renameSavedTheme(s: AppSettings, id: string, name: string): AppSettings {
  const clean = name.trim().slice(0, 40);
  if (!clean) return s;
  const rename = (t: ThemeSettings) => (t.id === id ? { ...t, name: clean } : t);
  return { ...s, theme: rename(s.theme), savedThemes: s.savedThemes.map(rename) };
}

export function duplicateSavedTheme(s: AppSettings, id: string): AppSettings {
  const src = s.savedThemes.find((t) => t.id === id);
  if (!src || s.savedThemes.length >= MAX_SAVED_THEMES) return s;
  const copy = { ...src, id: newThemeId(), name: `${src.name} ${t("doc.copySuffix")}`.slice(0, 40) };
  return { ...s, savedThemes: [...s.savedThemes, copy] };
}

export function deleteSavedTheme(s: AppSettings, id: string): AppSettings {
  const theme = s.theme.id === id ? customFrom(s.theme) : s.theme;
  return { ...s, theme, savedThemes: s.savedThemes.filter((t) => t.id !== id) };
}

export const isBuiltinId = (id: string) => BUILTIN_THEMES.some((t) => t.id === id);
