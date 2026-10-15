import { t } from "../i18n";
import { decodeUtf8 } from "../shared/utf8";
import { FileError } from "../shared/errors";
import { IMPORT_EXTENSIONS, type ImportResult, MAX_HTML_BYTES } from "./types";

const extensionOf = (name: string) => /\.[^./\\]+$/.exec(name.toLowerCase())?.[0] ?? "";

const hasZipSignature = (buf: ArrayBuffer) => {
  const b = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
  return b.length === 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
};

export function validateImportName(name: string): void {
  if (!(IMPORT_EXTENSIONS as readonly string[]).includes(extensionOf(name))) {
    throw new FileError(
      "unsupported-extension",
      t("import.unsupported", { name, list: IMPORT_EXTENSIONS.join(t("import.listSeparator")) }),
    );
  }
}

/**
 * Convert an imported file to Markdown. The extension selects the converter, but the actual
 * bytes are checked too: a renamed file is rejected rather than "converted".
 * The converters (mammoth, turndown, jszip) are loaded on demand to keep the main bundle small.
 */
export async function importDocument(name: string, buffer: ArrayBuffer): Promise<ImportResult> {
  validateImportName(name);
  const ext = extensionOf(name);

  if (ext === ".docx") {
    const { docxToMarkdown } = await import("./docx");
    const { markdown, warnings } = await docxToMarkdown(buffer);
    return { markdown, warnings, sourceFormat: "docx" };
  }

  if (hasZipSignature(buffer)) {
    throw new FileError("invalid-encoding", t("import.htmlIsArchive", { name }));
  }
  if (buffer.byteLength > MAX_HTML_BYTES) {
    throw new FileError("too-large", t("file.tooLarge", { n: MAX_HTML_BYTES / 1024 / 1024 }));
  }
  const { htmlToMarkdown } = await import("./html");
  const { markdown, warnings } = htmlToMarkdown(decodeUtf8(buffer));
  return { markdown, warnings, sourceFormat: "html" };
}
