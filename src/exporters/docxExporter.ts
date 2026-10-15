import { t } from "../i18n";
import type { Exporter } from "./types";

/**
 * Registry entry for DOCX. The implementation (docx + jszip, several hundred kB) is loaded on
 * first use so it stays out of the main bundle.
 */
export const docxExporter: Exporter = {
  format: "docx",
  get label() {
    return t("export.label.docx");
  },
  extension: ".docx",
  mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  usesStyle: true,
  exportBinary: async (input) => (await import("./docx")).exportDocx(input),
};
