import type { FileRef } from "./fileRef";

/** Plain data exchanged with the platform's file operations (see `platform/types.ts` for the operations themselves). */

export interface OpenedFile {
  name: string;
  text: string;
  handle?: FileRef;
}

export interface SavedFile {
  name: string;
  handle?: FileRef;
}

export interface PickedFile {
  name: string;
  buffer: ArrayBuffer;
}

export interface ExportTarget {
  fileName: string;
  extension: string;
  mime: string;
  /** Description shown in the save dialog's file-type filter. */
  description: string;
}

export interface RecentFile {
  id: string;
  name: string;
  openedAt: number;
  handle: FileRef;
}
