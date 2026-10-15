import { htmlExporter } from "./html";
import { docxExporter } from "./docxExporter";
import { pdfExporter } from "./pdf";
import { txtExporter } from "./txt";
import type { ExportFormat, Exporter } from "./types";

export const EXPORTERS: Record<ExportFormat, Exporter> = {
  html: htmlExporter,
  txt: txtExporter,
  pdf: pdfExporter,
  docx: docxExporter,
};

export const EXPORT_FORMATS = Object.keys(EXPORTERS) as ExportFormat[];
