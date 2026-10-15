export type FileErrorCode =
  | "unsupported-extension"
  | "too-large"
  | "invalid-encoding"
  | "permission-denied"
  | "not-found"
  | "write-failed"
  | "unknown";

export class FileError extends Error {
  readonly code: FileErrorCode;
  readonly detail?: string;

  constructor(code: FileErrorCode, message: string, detail?: string) {
    super(message);
    this.name = "FileError";
    this.code = code;
    this.detail = detail;
  }
}
