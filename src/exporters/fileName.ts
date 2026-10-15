import { t } from "../i18n";
import { FileError } from "../shared/errors";

const ILLEGAL_CHARS = /[\\/:*?"<>|]/;
const ILLEGAL_CHARS_GLOBAL = /[\\/:*?"<>|]/g;
const hasControlChar = (s: string) => [...s].some((c) => c.charCodeAt(0) < 32);
const ILLEGAL = { test: (s: string) => ILLEGAL_CHARS.test(s) || hasControlChar(s) };
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
export const MAX_NAME_LENGTH = 120;

/**
 * Validate a user-typed export file name (without extension handling surprises) and
 * return the final name with the format's extension. Throws FileError with a readable message.
 */
export function buildExportFileName(raw: string, extension: string): string {
  let name = raw.trim();
  if (name.toLowerCase().endsWith(extension)) name = name.slice(0, -extension.length);
  if (name === "") throw new FileError("unknown", t("name.empty"));
  if (ILLEGAL.test(name)) throw new FileError("unknown", t("name.illegal"));
  if (/[. ]$/.test(name)) throw new FileError("unknown", t("name.trailing"));
  if (RESERVED.test(name)) throw new FileError("unknown", t("name.reserved", { name }));
  if (name.length + extension.length > MAX_NAME_LENGTH) throw new FileError("unknown", t("name.tooLong", { n: MAX_NAME_LENGTH }));
  return name + extension;
}

export function defaultExportName(title: string): string {
  const base = title.replace(/\.(md|markdown|txt)$/i, "").replace(ILLEGAL_CHARS_GLOBAL, "_");
  return [...base].map((c) => (c.charCodeAt(0) < 32 ? "_" : c)).join("").trim() || t("doc.untitled");
}
