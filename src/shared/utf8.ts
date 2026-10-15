import { t } from "../i18n";
import { FileError } from "./errors";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Decode strictly as UTF-8 so binary or mis-encoded files are rejected instead of corrupted. */
export function decodeUtf8(buffer: ArrayBuffer): string {
  if (buffer.byteLength > MAX_FILE_BYTES) {
    throw new FileError("too-large", t("file.tooLarge", { n: MAX_FILE_BYTES / 1024 / 1024 }));
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new FileError("invalid-encoding", t("file.notUtf8"));
  }
}
