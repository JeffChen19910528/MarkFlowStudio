import { useT } from "../i18n/react";
import type { Status } from "../shared/status";

interface Props {
  status: Status;
  onDismiss: () => void;
}

/** A dismissible message. Errors are announced immediately; other messages politely. */
export function StatusBanner({ status, onDismiss }: Props) {
  const t = useT();
  return (
    <div className={`banner ${status.kind}`} role={status.kind === "error" ? "alert" : "status"}>
      <span>{status.text}</span>
      {status.detail && <small>({status.detail})</small>}
      <button onClick={onDismiss} aria-label={t("status.dismiss")}>×</button>
    </div>
  );
}
