/**
 * Everything the app needs from the outside world, as interfaces.
 *
 * The UI and the state hooks depend on these types, never on browser APIs directly. The browser
 * implementation lives in `./browser.ts`; tests supply fakes; a desktop shell would supply its own.
 */
import type { FileRef, FolderRef } from "../shared/fileRef";
import type { ExportTarget, OpenedFile, PickedFile, RecentFile, SavedFile } from "../shared/files";

export type { ExportTarget, OpenedFile, PickedFile, RecentFile, SavedFile } from "../shared/files";

/** Opening, saving, exporting and picking files and folders. Every `pick`/`open`/`save` returns null on cancel. */
export interface FileApi {
  /** Can documents be written back in place? (Otherwise saving downloads a copy.) */
  hasNativeFileAccess(): boolean;
  openFile(): Promise<OpenedFile | null>;
  /** Re-open a previously used file; may ask the user to re-grant access. */
  openFromRef(ref: FileRef): Promise<OpenedFile>;
  saveFile(text: string, title: string, ref?: FileRef): Promise<SavedFile | null>;
  saveFileAs(text: string, title: string): Promise<SavedFile | null>;
  /** Write exported content. Refuses to overwrite `source`, and verifies the output is non-empty. */
  exportToFile(content: string | Uint8Array<ArrayBuffer>, target: ExportTarget, source?: FileRef): Promise<SavedFile | null>;
  pickImportFile(): Promise<PickedFile | null>;
  hasFolderPicker(): boolean;
  pickImageFolder(): Promise<FolderRef | null>;
}

/** Recently used files (name, time and a reference; never content). */
export interface RecentStore {
  /** False where file references cannot be kept (no recent files then). */
  readonly supported: boolean;
  list(): Promise<RecentFile[]>;
  add(ref: FileRef): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}

/** Hand a complete HTML document to the system's print dialog. */
export interface Printer {
  printHtml(html: string): Promise<void>;
}

export interface Platform {
  files: FileApi;
  recents: RecentStore;
  printer: Printer;
}
