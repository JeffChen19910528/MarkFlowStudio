import { t } from "../i18n";
import type { OpenedFile, SavedFile } from "../shared/files";
import { FileError } from "../shared/errors";
import { downloadText, isAbort, mapError, picker } from "./browser";
import { decodeUtf8 } from "../shared/utf8";
import { ALLOWED_EXTENSIONS, suggestFileName, validateFileName } from "./text";

const pickerTypes = () => [
  { description: t("file.pickerDescription"), accept: { "text/markdown": [".md", ".markdown"], "text/plain": [".txt"] } },
];

async function readHandle(handle: FileSystemFileHandle): Promise<OpenedFile> {
  validateFileName(handle.name);
  const file = await handle.getFile();
  return { name: handle.name, text: decodeUtf8(await file.arrayBuffer()), handle };
}

/** Fallback for browsers without File System Access: hidden <input type=file>. */
function openViaInput(): Promise<OpenedFile | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ALLOWED_EXTENSIONS.join(",");
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        validateFileName(file.name);
        resolve({ name: file.name, text: decodeUtf8(await file.arrayBuffer()) });
      } catch (e) {
        reject(mapError(e, t("file.readFailed")));
      }
    };
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

/** Returns null when the user cancels the dialog. */
export async function openFile(): Promise<OpenedFile | null> {
  try {
    const p = picker();
    if (!p.showOpenFilePicker) return await openViaInput();
    const [handle] = await p.showOpenFilePicker({ types: pickerTypes(), multiple: false });
    return await readHandle(handle);
  } catch (e) {
    if (isAbort(e)) return null;
    throw mapError(e, t("file.openFailed"));
  }
}

export async function writeHandle(handle: FileSystemFileHandle, text: string | Uint8Array<ArrayBuffer>): Promise<void> {
  const writable = await handle.createWritable(); // writes to a temp file; original untouched until close()
  try {
    await writable.write(text);
    await writable.close();
  } catch (e) {
    await writable.abort().catch(() => undefined);
    throw e;
  }
}

/** Save to an existing handle (or prompt when none). Returns null if the user cancels. */
export async function saveFile(
  text: string,
  title: string,
  handle?: FileSystemFileHandle,
): Promise<SavedFile | null> {
  try {
    if (handle) {
      await writeHandle(handle, text);
      return { name: handle.name, handle };
    }
    return await saveFileAs(text, title);
  } catch (e) {
    throw mapError(e, t("file.saveFailed"));
  }
}

export async function saveFileAs(text: string, title: string): Promise<SavedFile | null> {
  try {
    const p = picker();
    const suggested = suggestFileName(title);
    if (!p.showSaveFilePicker) {
      downloadText(suggested, text);
      return { name: suggested };
    }
    const handle = await p.showSaveFilePicker({ suggestedName: suggested, types: pickerTypes() });
    validateFileName(handle.name);
    await writeHandle(handle, text);
    return { name: handle.name, handle };
  } catch (e) {
    if (isAbort(e)) return null;
    throw mapError(e, t("file.saveAsFailed"));
  }
}

type PermissionedHandle = {
  queryPermission?: (d: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (d: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
};

/**
 * Re-open a file from a stored handle (recent files). Must be called from a user gesture, because
 * the browser may need to ask the user to re-grant access.
 */
export async function openFromHandle(handle: FileSystemFileHandle): Promise<OpenedFile> {
  try {
    const h = handle as unknown as PermissionedHandle;
    let state: PermissionState = (await h.queryPermission?.({ mode: "readwrite" })) ?? "granted";
    if (state !== "granted") state = (await h.requestPermission?.({ mode: "readwrite" })) ?? "denied";
    if (state !== "granted") throw new FileError("permission-denied", t("file.needPermission"));
    return await readHandle(handle);
  } catch (e) {
    throw mapError(e, t("file.openFailed"));
  }
}
