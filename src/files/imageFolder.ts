import { t } from "../i18n";
import { FileError } from "../shared/errors";
import type { FolderRef } from "../shared/fileRef";
import { isAbort, mapError } from "./browser";

export const hasDirectoryPicker = (): boolean =>
  typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";

/** Ask the user for a folder to read images from (read-only). Returns null on cancel. */
export async function pickImageDirectory(): Promise<FolderRef | null> {
  try {
    const pick = (window as unknown as { showDirectoryPicker?: (o: unknown) => Promise<FileSystemDirectoryHandle> })
      .showDirectoryPicker;
    if (!pick) throw new FileError("unknown", t("file.noFolderPicker"));
    return await pick({ mode: "read", id: "markflow-images" });
  } catch (e) {
    if (isAbort(e)) return null;
    throw mapError(e, t("file.folderFailed"));
  }
}
