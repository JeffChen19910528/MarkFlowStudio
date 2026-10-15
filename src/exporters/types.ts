import type { ResolvedImage } from "../images";
import type { ThemeSettings } from "../themes/themes";
import type { PdfOptions } from "./pdfOptions";

export type ExportFormat = "html" | "txt" | "pdf" | "docx";
export const EXPORT_FORMAT_IDS: readonly ExportFormat[] = ["html", "txt", "pdf", "docx"];

/**
 * "follow": use the current theme as-is (a dark editor theme gives a dark document).
 * "print":  keep typography but force the light Paper White colours, so a dark
 *           editing theme can never leak into the exported document.
 */
export type ExportStyle = "follow" | "print";

export interface ExportInput {
  markdown: string;
  /** Document title (usually the file name); used when the Markdown has no H1. */
  title: string;
  theme: ThemeSettings;
  style: ExportStyle;
  /** Only read by the PDF (print) exporter. */
  pdf?: PdfOptions;
  /** Local images already read from the user-granted folder, keyed by the `src` in the rendered output. */
  images?: ReadonlyMap<string, ResolvedImage>;
}

export interface ExportOutput {
  content: string;
  warnings: string[];
}

export interface BinaryOutput {
  data: Uint8Array<ArrayBuffer>;
  warnings: string[];
}

/** Exactly one of `export` (text, synchronous) or `exportBinary` (async, e.g. a zip container) is set. */
export interface Exporter {
  format: ExportFormat;
  label: string;
  extension: string;
  mime: string;
  /** Whether the "style" option applies to this format. */
  usesStyle: boolean;
  export?(input: ExportInput): ExportOutput;
  exportBinary?(input: ExportInput): Promise<BinaryOutput>;
}
