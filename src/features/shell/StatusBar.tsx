import type { MessageKey } from "../../i18n";
import { useT } from "../../i18n/react";
import type { DocStats } from "../../shared/document";

interface Props {
  stats: DocStats;
  /** Text for the autosave indicator, or null when autosave is off. */
  autosaveText: string | null;
  saveState: "busy" | "unsaved" | "saved";
  /** True where documents cannot be written back in place (saving downloads a copy). */
  compatMode: boolean;
}

const STATE_TEXT: Record<Props["saveState"], MessageKey> = { busy: "status.busy", unsaved: "status.unsaved", saved: "status.saved" };

export function StatusBar({ stats, autosaveText, saveState, compatMode }: Props) {
  const t = useT();
  return (
    <footer className="statusbar">
      <span>{t("status.words", { n: stats.words })}</span>
      <span>{t("status.chars", { n: stats.chars })}</span>
      <span>{t("status.lines", { n: stats.lines })}</span>
      <span>Markdown · UTF-8</span>
      {autosaveText && <span>{autosaveText}</span>}
      <span>{t(STATE_TEXT[saveState])}</span>
      {compatMode && <span title={t("status.compatHint")}>{t("status.compat")}</span>}
    </footer>
  );
}
