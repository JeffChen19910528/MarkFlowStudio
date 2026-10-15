/**
 * Interface language. A tiny module-level store rather than React state, because text is also produced
 * outside components (file errors, converter warnings). Components re-render on a change via `useT()`
 * in `./react.ts`.
 */
import { en } from "./en";
import { type MessageKey, zhTW } from "./zhTW";

export type { MessageKey } from "./zhTW";
export type Language = "zh-TW" | "en";
export const LANGUAGES: readonly Language[] = ["zh-TW", "en"];

const dictionaries: Record<Language, Record<MessageKey, string>> = { "zh-TW": zhTW, en };
const STORAGE_KEY = "markflow.language";

function isLanguage(v: unknown): v is Language {
  return v === "zh-TW" || v === "en";
}

/** The saved choice, otherwise the browser's language (any Chinese -> Traditional Chinese, else English). */
export function detectLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLanguage(saved)) return saved;
  } catch {
    /* storage unavailable */
  }
  const browser = typeof navigator === "undefined" ? "" : (navigator.language ?? "");
  return browser.toLowerCase().startsWith("zh") ? "zh-TW" : "en";
}

let current: Language = detectLanguage();
const listeners = new Set<() => void>();

export const getLanguage = (): Language => current;

/** Switch language. `persist` is false when the caller only wants to set it (tests). */
export function setLanguage(lang: Language, persist = true): void {
  if (lang === current) return;
  current = lang;
  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* the choice just will not be remembered */
    }
  }
  if (typeof document !== "undefined") document.documentElement.lang = htmlLang(lang);
  listeners.forEach((l) => l());
}

export function subscribeLanguage(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Value for the `lang` attribute of the page and of exported documents. */
export const htmlLang = (lang: Language = current): string => (lang === "en" ? "en" : "zh-Hant");

/** Translate a key in the current language, filling `{name}` placeholders. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const text = dictionaries[current][key];
  return params ? text.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m)) : text;
}

if (typeof document !== "undefined") document.documentElement.lang = htmlLang(current);

/** Is this the default name of an unsaved document, in any language? (Names stay as they were created.) */
export const isUntitledTitle = (title: string): boolean =>
  LANGUAGES.some((l) => new RegExp(dictionaries[l]["doc.untitledPattern"]).test(title));
