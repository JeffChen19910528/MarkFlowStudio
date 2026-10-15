import type { ExportFormat } from "../../exporters/types";
import { useT } from "../../i18n/react";
import type { ExportResult } from "./useExportOutput";

interface Props {
  format: ExportFormat;
  extension: string;
  content: ExportResult["content"];
}

/** Shows exactly what will be written: plain text, an HTML preview in a sandboxed frame, or a note for binary files. */
export function OutputPreview({ format, extension, content }: Props) {
  const t = useT();
  if (content instanceof Uint8Array) {
    return (
      <p className="muted" role="status">
        {t("export.binaryPreview", { ext: extension, kb: Math.max(1, Math.round(content.length / 1024)) })}
      </p>
    );
  }
  return (
    <div className="export-preview">
      <div className="muted">{format === "pdf" ? t("export.previewPdf") : t("export.previewOutput")}</div>
      {format === "txt" ? <pre aria-label={t("export.previewLabel")}>{content}</pre> : <iframe title={t("export.previewLabel")} sandbox="" srcDoc={content} />}
    </div>
  );
}
