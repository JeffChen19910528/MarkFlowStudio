import { Modal } from "../../components/Modal";
import { useT } from "../../i18n/react";
import type { ImportFormat } from "../../importers/types";

interface Props {
  fileName: string;
  format: ImportFormat;
  warnings: string[];
  onClose: () => void;
}

const LABEL: Record<ImportFormat, string> = { html: "HTML", docx: "Word (.docx)" };

export function ImportReport({ fileName, format, warnings, onClose }: Props) {
  const t = useT();
  return (
    <Modal className="export-dialog" labelledBy="imp-title" onClose={onClose}>
      <h2 id="imp-title">{t("import.title")}</h2>
      <p>
        {t("import.source", { fileName, format: LABEL[format] })}
        <strong>{t("import.unsavedWord")}</strong>
        {t("import.sourceTail")}
      </p>
      {warnings.length === 0 ? (
        <p className="muted">{t("import.noLoss")}</p>
      ) : (
        <>
          <h3>{t("import.report")}</h3>
          <ul className="report">
            {warnings.map((w) => (
              <li key={w}>⚠ {w}</li>
            ))}
          </ul>
        </>
      )}
      <div className="modal-actions">
        <button className="primary" data-autofocus onClick={onClose}>
          {t("import.start")}
        </button>
      </div>
    </Modal>
  );
}
