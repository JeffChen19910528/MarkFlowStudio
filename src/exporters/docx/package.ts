import { t } from "../../i18n";
import { AlignmentType, LevelFormat } from "docx";
import JSZip from "jszip";

import { LIST_INDENT, MAX_LIST_LEVELS } from "./context";

export function numberingConfig() {
  const bullets = ["•", "◦", "▪"];
  const levels = (ordered: boolean) =>
    Array.from({ length: MAX_LIST_LEVELS }, (_, level) => ({
      level,
      format: ordered ? LevelFormat.DECIMAL : LevelFormat.BULLET,
      text: ordered ? `%${level + 1}.` : bullets[level % bullets.length],
      alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: LIST_INDENT * (level + 1), hanging: 360 } } },
    }));
  return { config: [{ reference: "bullets", levels: levels(false) }, { reference: "ordered", levels: levels(true) }] };
}

/** Confirm the bytes are a real OOXML package with a non-empty main document part. */
export async function validateDocx(data: Uint8Array): Promise<void> {
  if (data.length < 4 || data[0] !== 0x50 || data[1] !== 0x4b) throw new Error(t("docx.notZip"));
  const zip = await JSZip.loadAsync(data);
  const doc = await zip.file("word/document.xml")?.async("string");
  if (!zip.file("[Content_Types].xml") || !doc || !doc.includes("<w:body>")) {
    throw new Error(t("docx.missingContent"));
  }
}
