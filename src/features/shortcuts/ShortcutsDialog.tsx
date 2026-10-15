import { Modal } from "../../components/Modal";
import type { MessageKey } from "../../i18n";
import { useT } from "../../i18n/react";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? "⌘" : "Ctrl";

type Item = [name: MessageKey, keys: string];

/** Only shortcuts that are actually bound: the app's own (App.tsx) and CodeMirror's history/search keymaps. */
const SHORTCUTS: { group: MessageKey; items: Item[] }[] = [
  {
    group: "shortcuts.groupFile",
    items: [
      ["shortcuts.save", `${MOD}+S`],
      ["shortcuts.saveAs", `${MOD}+Shift+S`],
    ],
  },
  {
    group: "shortcuts.groupEdit",
    items: [
      ["shortcuts.undo", `${MOD}+Z`],
      ["shortcuts.redo", isMac ? "⌘+Shift+Z" : "shortcuts.redoKeys"],
    ],
  },
  {
    group: "shortcuts.groupSearch",
    items: [
      ["shortcuts.find", `${MOD}+F`],
      ["shortcuts.next", "shortcuts.nextKeys"],
      ["shortcuts.prev", "shortcuts.prevKeys"],
      ["shortcuts.closeSearch", "Esc"],
    ],
  },
  {
    group: "shortcuts.groupDialog",
    items: [
      ["shortcuts.closeDialog", "shortcuts.closeDialogKeys"],
      ["shortcuts.moveFocus", "shortcuts.moveFocusKeys"],
    ],
  },
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  // Entries whose keys are a message key are translated; the rest are literal key names.
  const keysText = (keys: string) => (keys.startsWith("shortcuts.") ? t(keys as MessageKey, { mod: MOD }) : keys);
  return (
    <Modal className="export-dialog" labelledBy="sc-title" onClose={onClose}>
      <h2 id="sc-title">{t("shortcuts.title")}</h2>
      {SHORTCUTS.map((g) => (
        <section key={g.group}>
          <h3>{t(g.group)}</h3>
          <dl className="shortcuts">
            {g.items.map(([name, keys]) => (
              <div key={name}>
                <dt>{t(name)}</dt>
                <dd>
                  <kbd>{keysText(keys)}</kbd>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      <div className="modal-actions">
        <button className="primary" data-autofocus onClick={onClose}>
          {t("common.close")}
        </button>
      </div>
    </Modal>
  );
}
