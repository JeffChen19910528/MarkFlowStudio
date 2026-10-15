import { useT } from "../../i18n/react";

export interface TabSummary {
  id: string;
  title: string;
  dirty: boolean;
}

interface Props {
  tabs: TabSummary[];
  activeId: string;
  /** Disables "new document" while another operation is running. */
  busy: boolean;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
}

export function TabBar({ tabs, activeId, busy, onActivate, onClose, onNew }: Props) {
  const t = useT();
  return (
    <nav className="tabs" aria-label={t("tabs.label")}>
      <ul>
        {tabs.map((tab) => {
          const on = tab.id === activeId;
          return (
            <li key={tab.id} className={on ? "tab active" : "tab"}>
              <button className="tab-main" aria-current={on ? "true" : undefined} title={tab.title} onClick={() => onActivate(tab.id)}>
                {tab.dirty ? "● " : ""}
                {tab.title}
              </button>
              <button className="tab-close" aria-label={t("tabs.close", { title: tab.title })} onClick={() => onClose(tab.id)}>
                ×
              </button>
            </li>
          );
        })}
      </ul>
      <button className="tab-new" aria-label={t("tabs.new")} onClick={onNew} disabled={busy}>
        ＋
      </button>
    </nav>
  );
}
