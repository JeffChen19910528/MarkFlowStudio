import { t } from "../i18n";
import { FileError } from "../shared/errors";

export const ALLOWED_EXTENSIONS = [".md", ".markdown", ".txt"] as const;

export function validateFileName(name: string): void {
  const lower = name.toLowerCase();
  if (!ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    throw new FileError("unsupported-extension", t("file.unsupportedType", { name }));
  }
}

export function suggestFileName(title: string): string {
  const cleaned = title.replace(/[\\/:*?"<>|]/g, "_").trim() || t("doc.untitled");
  return ALLOWED_EXTENSIONS.some((e) => cleaned.toLowerCase().endsWith(e)) ? cleaned : `${cleaned}.md`;
}
