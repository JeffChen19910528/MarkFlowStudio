import { LANGUAGES, type Language, type MessageKey, setLanguage } from "../../i18n";
import { useLanguage, useT } from "../../i18n/react";
import type { ViewMode } from "../../settings/settings";

const VIEW_MODES: readonly (readonly [ViewMode, MessageKey])[] = [
  ["edit", "toolbar.viewEdit"],
  ["split", "toolbar.viewSplit"],
  ["preview", "toolbar.viewPreview"],
];

interface Props {
  /** True while a file operation is running; disables the buttons that start another one. */
  busy: boolean;
  viewMode: ViewMode;
  syncScroll: boolean;
  sidebarOpen: boolean;
  settingsOpen: boolean;
  onNew: () => void;
  onOpen: () => void;
  onImport: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onExport: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSearch: () => void;
  onViewMode: (mode: ViewMode) => void;
  onSyncScroll: (enabled: boolean) => void;
  onToggleSidebar: () => void;
  onToggleSettings: () => void;
  onShortcuts: () => void;
}

export function Toolbar(p: Props) {
  const t = useT();
  const language = useLanguage();
  return (
    <div className="toolbar" role="toolbar" aria-label={t("toolbar.label")}>
      <button onClick={p.onNew} disabled={p.busy}>{t("toolbar.new")}</button>
      <button onClick={p.onOpen} disabled={p.busy}>{t("toolbar.open")}</button>
      <button onClick={p.onImport} disabled={p.busy}>{t("toolbar.import")}</button>
      <button onClick={p.onSave} disabled={p.busy}>{t("toolbar.save")}</button>
      <button onClick={p.onSaveAs} disabled={p.busy}>{t("toolbar.saveAs")}</button>
      <button onClick={p.onExport} disabled={p.busy}>{t("toolbar.export")}</button>
      <span className="sep" />
      <button onClick={p.onUndo}>{t("toolbar.undo")}</button>
      <button onClick={p.onRedo}>{t("toolbar.redo")}</button>
      <button onClick={p.onSearch} disabled={p.viewMode === "preview"}>{t("toolbar.search")}</button>
      <span className="sep" />
      <div className="seg" role="group" aria-label={t("toolbar.viewMode")}>
        {VIEW_MODES.map(([mode, label]) => (
          <button key={mode} aria-pressed={p.viewMode === mode} onClick={() => p.onViewMode(mode)}>
            {t(label)}
          </button>
        ))}
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={p.syncScroll}
          disabled={p.viewMode !== "split"}
          onChange={(e) => p.onSyncScroll(e.target.checked)}
        />
        {t("toolbar.syncScroll")}
      </label>
      <button aria-pressed={p.sidebarOpen} onClick={p.onToggleSidebar}>{t("toolbar.sidebar")}</button>
      <button aria-pressed={p.settingsOpen} onClick={p.onToggleSettings}>{t("toolbar.appearance")}</button>
      <button onClick={p.onShortcuts}>{t("toolbar.shortcuts")}</button>
      <select className="lang-select" aria-label={t("lang.label")} value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
        {LANGUAGES.map((l) => (
          <option key={l} value={l} lang={l === "en" ? "en" : "zh-Hant"}>{t(`lang.${l}`)}</option>
        ))}
      </select>
    </div>
  );
}
