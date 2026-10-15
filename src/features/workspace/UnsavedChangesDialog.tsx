import { Modal } from "../../components/Modal";
import { useT } from "../../i18n/react";

interface Props {
  title: string;
  onChoose: (choice: "save" | "discard" | "cancel") => void;
}

/** Asked before closing a document that has unsaved changes. Escape means "cancel". */
export function UnsavedChangesDialog({ title, onChoose }: Props) {
  const t = useT();
  return (
    <Modal role="alertdialog" labelledBy="dlg-title" onClose={() => onChoose("cancel")}>
      <h2 id="dlg-title">{t("unsaved.title")}</h2>
      <p>{t("unsaved.body", { title })}</p>
      <div className="modal-actions">
        <button data-autofocus onClick={() => onChoose("save")}>{t("unsaved.save")}</button>
        <button onClick={() => onChoose("discard")}>{t("unsaved.discard")}</button>
        <button onClick={() => onChoose("cancel")}>{t("common.cancel")}</button>
      </div>
    </Modal>
  );
}
