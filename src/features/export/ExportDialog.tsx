import { useMemo, useState } from "react";
import { Modal } from "../../components/Modal";
import { buildExportFileName, defaultExportName } from "../../exporters/fileName";
import { EXPORTERS, EXPORT_FORMATS } from "../../exporters/index";
import { type PdfOptions, pdfOptionsError } from "../../exporters/pdfOptions";
import type { ExportFormat, ExportInput, ExportStyle } from "../../exporters/types";
import { useT } from "../../i18n/react";
import { usePlatform } from "../../platform/PlatformContext";
import { FileError } from "../../shared/errors";
import type { FileRef, FolderRef } from "../../shared/fileRef";
import type { ThemeSettings } from "../../themes/themes";
import { OutputPreview } from "./OutputPreview";
import { PdfOptionsForm } from "./PdfOptionsForm";
import { useExportOutput } from "./useExportOutput";
import { useImageLoading } from "./useImageLoading";

interface Props {
  markdown: string;
  title: string;
  theme: ThemeSettings;
  initialFormat: ExportFormat;
  initialStyle: ExportStyle;
  initialPdf: PdfOptions;
  /** The file the document was opened from; exports refuse to overwrite it. */
  getSourceFile: () => FileRef | undefined;
  /** Folder granted for relative image paths; images found there are embedded in the export. */
  imageFolder?: FolderRef;
  onRemember: (format: ExportFormat, style: ExportStyle, pdf: PdfOptions) => void;
  onClose: () => void;
  /** "success": a file was written. "info": handed to the print dialog; outcome unknown. */
  onDone: (kind: "success" | "info", message: string) => void;
}

const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};
const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function ExportDialog(p: Props) {
  const t = useT();

  const { files, printer } = usePlatform();
  const [format, setFormat] = useState(p.initialFormat);
  const [style, setStyle] = useState(p.initialStyle);
  const [pdf, setPdf] = useState(p.initialPdf);
  const [name, setName] = useState(() => defaultExportName(p.title));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const exporter = EXPORTERS[format];
  const isPdf = format === "pdf";
  const empty = p.markdown.trim() === "";

  // Not memoised: it is cheap, and the message is translated, so it must follow the language.
  const nameCheck = (() => {
    try {
      return { fileName: buildExportFileName(name, exporter.extension), error: null };
    } catch (e) {
      return { fileName: null, error: e instanceof FileError ? e.message : t("export.invalidName") };
    }
  })();

  const pdfError = isPdf ? pdfOptionsError(pdf) : null;
  const imageState = useImageLoading(p.markdown, p.imageFolder, format !== "txt");

  // For PDF the file name becomes the document title, which browsers use as the default PDF name.
  const docTitle = isPdf ? name || p.title : p.title;
  const input = useMemo<ExportInput>(
    () => ({ markdown: p.markdown, title: docTitle, theme: p.theme, style, pdf, images: imageState.images }),
    [p.markdown, docTitle, p.theme, style, pdf, imageState.images],
  );
  const output = useExportOutput(exporter, input, imageState.ready && !pdfError && !empty);

  const canExport = !busy && !empty && output.out !== null && nameCheck.fileName !== null && !pdfError;

  const run = async () => {
    if (!canExport || !output.out || !nameCheck.fileName) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    p.onRemember(format, style, pdf);
    try {
      if (isPdf && typeof output.out.content === "string") {
        await printer.printHtml(output.out.content);
        p.onDone("info", t("export.printOpened"));
        return;
      }
      const saved = await files.exportToFile(
        output.out.content,
        { fileName: nameCheck.fileName, extension: exporter.extension, mime: exporter.mime, description: exporter.label },
        p.getSourceFile(),
      );
      if (!saved) setNotice(t("export.cancelled"));
      else p.onDone("success", saved.handle ? t("export.done", { name: saved.name }) : t("export.downloaded", { name: saved.name }));
    } catch (e) {
      setError(e instanceof FileError ? e.message : errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal className="export-dialog" labelledBy="exp-title" onClose={p.onClose} closeOnEscape={!busy}>
      <h2 id="exp-title">{t("export.title")}</h2>

      <fieldset>
        <legend>{t("export.format")}</legend>
        {EXPORT_FORMATS.map((f) => (
          <label key={f} className="check">
            <input type="radio" name="format" checked={format === f} onChange={() => setFormat(f)} disabled={busy} />
            {EXPORTERS[f].label}
          </label>
        ))}
      </fieldset>

      {exporter.usesStyle && (
        <fieldset>
          <legend>{t("export.style")}</legend>
          <label className="check">
            <input type="radio" name="style" checked={style === "print"} onChange={() => setStyle("print")} disabled={busy} />
            {t("export.stylePrint")}
          </label>
          <label className="check">
            <input type="radio" name="style" checked={style === "follow"} onChange={() => setStyle("follow")} disabled={busy} />
            {t("export.styleFollow", { name: p.theme.name })}
          </label>
        </fieldset>
      )}

      {isPdf && <PdfOptionsForm value={pdf} onChange={setPdf} disabled={busy} />}
      {pdfError && <p className="warn" role="alert">{pdfError}</p>}

      <label className="field">
        <span>{t("export.fileName")}</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={nameCheck.error !== null}
          aria-describedby="exp-name-msg"
          disabled={busy}
        />
        <span>{exporter.extension}</span>
      </label>
      <p id="exp-name-msg" className="warn" hidden={nameCheck.error === null}>{nameCheck.error}</p>
      {isPdf && <p className="muted">{t("export.pdfNote")}</p>}

      {empty && <p className="warn" role="status">{t("export.empty")}</p>}
      {imageState.needsImages && !imageState.ready && <p className="muted" role="status">{t("export.loadingImages")}</p>}
      {output.generating && <p className="muted" role="status">{t("export.generating", { ext: exporter.extension })}</p>}
      {imageState.failures.slice(0, 5).map((f) => (
        <p key={f.src} className="warn" role="status">{t("export.imageFailed", { src: safeDecode(f.src), message: f.message })}</p>
      ))}
      {imageState.failures.length > 5 && <p className="warn" role="status">{t("export.moreImagesFailed", { n: imageState.failures.length - 5 })}</p>}
      {output.error && <p className="warn" role="alert">{t("export.convertFailed", { message: output.error })}</p>}
      {output.out?.warnings.map((w) => (
        <p key={w} className="warn" role="status">⚠ {w}</p>
      ))}

      {output.out && !empty && <OutputPreview format={format} extension={exporter.extension} content={output.out.content} />}

      {error && <p className="banner error" role="alert">{error}{isPdf ? "" : t("export.sourceUntouched")}</p>}
      {notice && <p className="muted" role="status">{notice}</p>}

      <div className="modal-actions">
        <button onClick={p.onClose} disabled={busy}>{t("common.cancel")}</button>
        <button className="primary" onClick={() => void run()} disabled={!canExport}>
          {busy ? t("common.busy") : isPdf ? t("export.printButton") : t("export.saveButton")}
        </button>
      </div>
    </Modal>
  );
}
