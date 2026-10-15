/**
 * An opaque reference to a file the user opened or saved.
 *
 * The app only ever needs a file's name and whether two references point at the same file; how the
 * file is actually read and written is the platform's business. In the browser a `FileRef` is a
 * file handle from the File System Access API; a desktop shell could use a path-backed object instead.
 */
export interface FileRef {
  readonly name: string;
  isSameEntry(other: FileRef): Promise<boolean>;
}

/** A folder the user granted read access to (used for relative image paths). */
export interface FolderRef {
  readonly name: string;
  getDirectoryHandle(name: string): Promise<FolderRef>;
  getFileHandle(name: string): Promise<{ getFile(): Promise<File> }>;
}
