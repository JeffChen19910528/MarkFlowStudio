export type ImportFormat = "html" | "docx";

export interface ImportResult {
  markdown: string;
  /** Conversion losses and caveats, in plain language. Empty means nothing known was lost. */
  warnings: string[];
  sourceFormat: ImportFormat;
}

export const MAX_HTML_BYTES = 5 * 1024 * 1024;
export const MAX_DOCX_BYTES = 20 * 1024 * 1024;
/** Best-effort guard against zip bombs (sizes are as declared by the archive). */
export const MAX_DOCX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;

export const IMPORT_EXTENSIONS = [".html", ".htm", ".docx"] as const;
