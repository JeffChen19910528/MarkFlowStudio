import { useState } from "react";
import { NumberField } from "../../components/NumberField";
import type { MessageKey } from "../../i18n";
import { useT } from "../../i18n/react";
import {
  BUILTIN_THEMES,
  FONT_KEYS,
  type FontKey,
  LIMITS,
  type ThemeSettings,
  contrastRatio,
} from "../../themes/themes";
import {
  deleteSavedTheme,
  duplicateSavedTheme,
  editTheme,
  renameSavedTheme,
  resetTheme,
  saveAsNewTheme,
  selectTheme,
  updateSavedTheme,
} from "../../settings/themeOps";
import { AUTOSAVE_SEC, type AppSettings } from "../../settings/settings";

interface Props {
  settings: AppSettings;
  onChange: (next: AppSettings) => void;
  storageOk: boolean;
  /** The current document is linked to a file we can write back to. */
  autosaveActive: boolean;
}

const COLOR_FIELDS: [keyof ThemeSettings, MessageKey][] = [
  ["editorBackground", "settings.color.editorBackground"],
  ["previewBackground", "settings.color.previewBackground"],
  ["textColor", "settings.color.textColor"],
  ["headingColor", "settings.color.headingColor"],
  ["linkColor", "settings.color.linkColor"],
  ["codeBackground", "settings.color.codeBackground"],
];

export function SettingsPanel({ settings, onChange, storageOk, autosaveActive }: Props) {
  const tr = useT();
  const t = settings.theme;
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const edit = (patch: Partial<ThemeSettings>) => onChange(editTheme(settings, patch));
  const savedIds = new Set(settings.savedThemes.map((x) => x.id));
  const isSaved = savedIds.has(t.id);

  const lowContrast = contrastRatio(t.textColor, t.previewBackground) < 4.5;
  const lowEditorContrast = contrastRatio(t.textColor, t.editorBackground) < 4.5;

  const selectValue = isSaved || BUILTIN_THEMES.some((b) => b.id === t.id) ? t.id : "custom";

  return (
    <aside className="settings" aria-label={tr("settings.title")}>
      <h2>{tr("settings.title")}</h2>

      <label className="field">
        <span>{tr("settings.theme")}</span>
        <select
          value={selectValue}
          onChange={(e) => {
            const id = e.target.value;
            const found = [...BUILTIN_THEMES, ...settings.savedThemes].find((x) => x.id === id);
            if (found) onChange(selectTheme(settings, found));
          }}
        >
          <optgroup label={tr("settings.builtin")}>
            {BUILTIN_THEMES.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </optgroup>
          {settings.savedThemes.length > 0 && (
            <optgroup label={tr("settings.mine")}>
              {settings.savedThemes.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </optgroup>
          )}
          {t.id === "custom" && <option value="custom">{tr("settings.customUnsaved")}</option>}
        </select>
      </label>

      <fieldset>
        <legend>{tr("settings.colors")}</legend>
        {COLOR_FIELDS.map(([key, label]) => (
          <label className="field color" key={key}>
            <span>{tr(label)}</span>
            <input type="color" value={t[key] as string} onChange={(e) => edit({ [key]: e.target.value })} />
          </label>
        ))}
        {(lowContrast || lowEditorContrast) && (
          <p className="warn" role="status">
            {tr("settings.lowContrast")}
          </p>
        )}
      </fieldset>

      <fieldset>
        <legend>{tr("settings.fontAndLayout")}</legend>
        <label className="field">
          <span>{tr("settings.font")}</span>
          <select value={t.fontFamily} onChange={(e) => edit({ fontFamily: e.target.value as FontKey })}>
            {FONT_KEYS.map((k) => (
              <option key={k} value={k}>{tr(`font.${k}`)}</option>
            ))}
          </select>
        </label>
        <NumberField label={tr("settings.fontSize")} value={t.fontSizePx} range={LIMITS.fontSizePx} step={1} onCommit={(n) => edit({ fontSizePx: n })} />
        <NumberField label={tr("settings.lineHeight")} value={t.lineHeight} range={LIMITS.lineHeight} step={0.1} onCommit={(n) => edit({ lineHeight: n })} />
        <NumberField label={tr("settings.paragraphSpacing")} value={t.paragraphSpacingPx} range={LIMITS.paragraphSpacingPx} step={1} onCommit={(n) => edit({ paragraphSpacingPx: n })} />
        <NumberField label={tr("settings.maxWidth")} value={t.contentMaxWidthPx} range={LIMITS.contentMaxWidthPx} step={10} onCommit={(n) => edit({ contentMaxWidthPx: n })} />
      </fieldset>

      <fieldset>
        <legend>{tr("settings.headingScale")}</legend>
        {t.headingScales.map((s, i) => (
          <NumberField
            key={i}
            label={`H${i + 1}`}
            value={s}
            range={LIMITS.headingScale}
            step={0.05}
            onCommit={(n) => {
              const next = [...t.headingScales] as ThemeSettings["headingScales"];
              next[i] = n;
              edit({ headingScales: next });
            }}
          />
        ))}
      </fieldset>

      <button onClick={() => onChange(resetTheme(settings))}>{tr("settings.reset")}</button>

      <fieldset>
        <legend>{tr("settings.customThemes")}</legend>
        <div className="row">
          <input
            aria-label={tr("settings.newThemeName")}
            placeholder={tr("settings.themeNamePlaceholder")}
            value={newName}
            maxLength={40}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button
            disabled={!newName.trim()}
            onClick={() => {
              onChange(saveAsNewTheme(settings, newName));
              setNewName("");
            }}
          >
            {tr("settings.saveAsTheme")}
          </button>
        </div>
        {isSaved && (
          <button onClick={() => onChange(updateSavedTheme(settings))}>{tr("settings.updateTheme", { name: t.name })}</button>
        )}
        <ul className="saved-themes">
          {settings.savedThemes.length === 0 && <li className="muted">{tr("settings.noCustomThemes")}</li>}
          {settings.savedThemes.map((s) => (
            <li key={s.id}>
              {renaming?.id === s.id ? (
                <>
                  <input
                    aria-label={tr("settings.rename")}
                    value={renaming.name}
                    maxLength={40}
                    autoFocus
                    onChange={(e) => setRenaming({ id: s.id, name: e.target.value })}
                  />
                  <button
                    onClick={() => {
                      onChange(renameSavedTheme(settings, s.id, renaming.name));
                      setRenaming(null);
                    }}
                  >
                    {tr("common.ok")}
                  </button>
                  <button onClick={() => setRenaming(null)}>{tr("common.cancel")}</button>
                </>
              ) : (
                <>
                  <span className="name">{s.name}</span>
                  <button onClick={() => setRenaming({ id: s.id, name: s.name })}>{tr("settings.rename")}</button>
                  <button onClick={() => onChange(duplicateSavedTheme(settings, s.id))}>{tr("settings.duplicate")}</button>
                  <button
                    onClick={() => {
                      if (window.confirm(tr("settings.confirmDelete", { name: s.name }))) onChange(deleteSavedTheme(settings, s.id));
                    }}
                  >
                    {tr("settings.delete")}
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset>
        <legend>{tr("settings.autosave")}</legend>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.autosave}
            onChange={(e) => onChange({ ...settings, autosave: e.target.checked })}
          />
          {tr("settings.autosaveEnable")}
        </label>
        <NumberField
          label={tr("settings.autosaveInterval")}
          value={settings.autosaveSec}
          range={AUTOSAVE_SEC}
          step={5}
          onCommit={(n) => onChange({ ...settings, autosaveSec: Math.round(n) })}
        />
        <p className="muted">
          {tr("settings.autosaveNote")}
          {settings.autosave && !autosaveActive && tr("settings.autosaveInactive")}
        </p>
      </fieldset>

      {!storageOk && <p className="warn">{tr("settings.storageFailed")}</p>}
    </aside>
  );
}
