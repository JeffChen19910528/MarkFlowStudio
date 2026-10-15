import { hasNativeFileAccess } from "../files/browser";
import { openFile, openFromHandle, saveFile, saveFileAs } from "../files/documents";
import { exportToFile } from "../files/exportFile";
import { hasDirectoryPicker, pickImageDirectory } from "../files/imageFolder";
import { pickImportFile } from "../files/importPicker";
import { addRecent, clearRecent, listRecent, removeRecent } from "../files/recent";
import { printHtml } from "./browserPrint";
import type { Platform } from "./types";

/**
 * The platform for a normal web page: File System Access API (with download/upload fallbacks),
 * IndexedDB for recent files, and the browser's print dialog.
 *
 * `FileRef` values are `FileSystemFileHandle`s here; the casts below are the only place that knows it.
 */
export const browserPlatform: Platform = {
  files: {
    hasNativeFileAccess,
    openFile,
    openFromRef: (ref) => openFromHandle(ref as FileSystemFileHandle),
    saveFile: (text, title, ref) => saveFile(text, title, ref as FileSystemFileHandle | undefined),
    saveFileAs,
    exportToFile: (content, target, source) => exportToFile(content, target, source as FileSystemFileHandle | undefined),
    pickImportFile,
    hasFolderPicker: hasDirectoryPicker,
    pickImageFolder: pickImageDirectory,
  },
  recents: {
    // Evaluated on access: a browser without the File System Access API cannot reopen stored references.
    get supported() {
      return hasNativeFileAccess();
    },
    list: listRecent,
    add: (ref) => addRecent(ref),
    remove: removeRecent,
    clear: clearRecent,
  },
  printer: { printHtml },
};
