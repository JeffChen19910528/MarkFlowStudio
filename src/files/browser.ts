import { t } from "../i18n";
import { FileError } from "../shared/errors";

export type Picker = {
  showOpenFilePicker?: (o: unknown) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (o: unknown) => Promise<FileSystemFileHandle>;
};

export const picker = (): Picker => window as unknown as Picker;
export const hasNativeFileAccess = (): boolean => typeof picker().showOpenFilePicker === "function";

export function mapError(e: unknown, fallback: string): FileError {
  if (e instanceof FileError) return e;
  const name = (e as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError")
    return new FileError("permission-denied", t("file.permissionDenied"));
  if (name === "NotFoundError") return new FileError("not-found", t("file.notFound"));
  return new FileError("unknown", fallback, e instanceof Error ? e.message : String(e));
}

export const isAbort = (e: unknown) => (e as { name?: string })?.name === "AbortError";

export function downloadText(name: string, text: string): void {
  downloadBlob(name, text, "text/markdown;charset=utf-8");
}

export function downloadBlob(name: string, text: string | Uint8Array<ArrayBuffer>, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
