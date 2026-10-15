import { t } from "../i18n";

export interface DocumentState {
  id: string;
  title: string;
  markdown: string;
  /** Content as last saved/opened; dirty state is derived from it. */
  savedMarkdown: string;
  hasFile: boolean;
  lastSavedAt?: string;
}

/** Default name of a new unsaved document, in the current interface language. */
export const untitledName = (): string => t("doc.untitledFile");

export function newDocument(markdown = "", title = untitledName(), hasFile = false): DocumentState {
  return {
    id: crypto.randomUUID(),
    title,
    markdown,
    savedMarkdown: markdown,
    hasFile,
  };
}

export const isDirty = (doc: DocumentState): boolean => doc.markdown !== doc.savedMarkdown;

export const withEdit = (doc: DocumentState, markdown: string): DocumentState => ({ ...doc, markdown });

/** `savedText` is what was actually written; edits typed while saving stay dirty. */
export const markSaved = (
  doc: DocumentState,
  title: string,
  savedText: string = doc.markdown,
  now = new Date(),
): DocumentState => ({
  ...doc,
  title,
  hasFile: true,
  savedMarkdown: savedText,
  lastSavedAt: now.toISOString(),
});

export interface DocStats {
  chars: number;
  words: number;
  lines: number;
}

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;

/** CJK characters count as one word each; other runs split on whitespace. */
export function computeStats(text: string): DocStats {
  const cjk = text.match(CJK)?.length ?? 0;
  const latin = text
    .replace(CJK, " ")
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  return {
    chars: [...text].length,
    words: cjk + latin,
    lines: text === "" ? 0 : text.split(/\r\n|\r|\n/).length,
  };
}
