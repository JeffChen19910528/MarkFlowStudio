import { t } from "../i18n";
import { FileError } from "../shared/errors";
import { downloadBlob, isAbort, mapError, picker } from "./browser";
import type { ExportTarget, SavedFile } from "../shared/files";
import { writeHandle } from "./documents";

/**
 * Write exported content to a user-chosen file. Never touches the source document:
 * choosing the source file itself is refused before anything is written.
 * Returns null on cancel; throws FileError on failure (including an empty result).
 */
export async function exportToFile(
  content: string | Uint8Array<ArrayBuffer>,
  target: ExportTarget,
  sourceHandle?: FileSystemFileHandle,
): Promise<SavedFile | null> {
  try {
    if (content.length === 0) throw new FileError("write-failed", t("file.exportEmpty"));
    const p = picker();
    if (!p.showSaveFilePicker) {
      downloadBlob(target.fileName, content, `${target.mime};charset=utf-8`);
      return { name: target.fileName };
    }
    const handle = await p.showSaveFilePicker({
      suggestedName: target.fileName,
      types: [{ description: target.description, accept: { [target.mime]: [target.extension] } }],
    });
    if (sourceHandle && (await sourceHandle.isSameEntry(handle))) {
      throw new FileError("write-failed", t("file.exportOverwrite"));
    }
    await writeHandle(handle, content);
    const written = await handle.getFile();
    if (written.size === 0) throw new FileError("write-failed", t("file.exportEmptyOutput"));
    return { name: handle.name, handle };
  } catch (e) {
    if (isAbort(e)) return null;
    throw mapError(e, t("file.exportFailed"));
  }
}
