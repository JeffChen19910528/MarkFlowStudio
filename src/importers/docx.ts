import JSZip from "jszip";
import mammoth from "mammoth";
import { t } from "../i18n";
import { FileError } from "../shared/errors";
import { htmlToMarkdown } from "./html";
import { MAX_DOCX_BYTES, MAX_DOCX_UNCOMPRESSED_BYTES } from "./types";

const OMITTED = "mf-omitted-image";
const MAX_MESSAGES = 10;

export const hasZipSignature = (buf: ArrayBuffer) => {
  const b = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
  return b.length === 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
};

/** Check size, signature and package structure before handing untrusted bytes to the converter. */
async function assertDocx(buffer: ArrayBuffer): Promise<void> {
  if (buffer.byteLength > MAX_DOCX_BYTES) {
    throw new FileError("too-large", t("import.docxTooLarge", { n: MAX_DOCX_BYTES / 1024 / 1024 }));
  }
  if (!hasZipSignature(buffer)) {
    throw new FileError("invalid-encoding", t("import.docxInvalid"));
  }
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new FileError("invalid-encoding", t("import.docxUnreadable"));
  }
  if (!zip.file("word/document.xml")) {
    throw new FileError("invalid-encoding", t("import.docxNotWord"));
  }
  let total = 0;
  zip.forEach((_path, entry) => {
    total += (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
  });
  if (total > MAX_DOCX_UNCOMPRESSED_BYTES) {
    throw new FileError("too-large", t("import.docxBomb"));
  }
}

export interface DocxConversion {
  markdown: string;
  warnings: string[];
}

export async function docxToMarkdown(buffer: ArrayBuffer): Promise<DocxConversion> {
  await assertDocx(buffer);

  let converted: Awaited<ReturnType<typeof mammoth.convertToHtml>>;
  try {
    converted = await mammoth.convertToHtml(
      { arrayBuffer: buffer },
      { convertImage: mammoth.images.imgElement(async () => ({ src: OMITTED })) },
    );
  } catch (e) {
    throw new FileError("unknown", t("import.docxFailed"), e instanceof Error ? e.message : String(e));
  }

  const images = (converted.value.match(new RegExp(`<img[^>]*${OMITTED}[^>]*>`, "g")) ?? []).length;
  const html = converted.value.replace(new RegExp(`<img[^>]*${OMITTED}[^>]*>`, "g"), "");
  const md = htmlToMarkdown(html);

  const warnings = [...md.warnings.filter((w) => w !== t("import.warnNoText"))];
  if (images > 0) warnings.unshift(t("import.warnDocxImages", { n: images }));
  const messages = [...new Set(converted.messages.map((m) => m.message))].slice(0, MAX_MESSAGES);
  for (const m of messages) warnings.push(t("import.warnDocxMessage", { message: m }));
  warnings.push(t("import.warnDocxLost"));
  if (md.markdown === "") warnings.unshift(t("import.warnNoText"));

  return { markdown: md.markdown, warnings };
}
