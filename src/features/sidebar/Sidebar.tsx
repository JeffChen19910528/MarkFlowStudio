import { getLanguage } from "../../i18n";
import { useT } from "../../i18n/react";
import type { OutlineItem } from "../../markdown/outline";
import type { RecentFile } from "../../platform/types";

interface Props {
  outline: OutlineItem[];
  onJump: (item: OutlineItem) => void;

  recents: RecentFile[];
  /** False in browsers without the File System Access API, where files cannot be remembered or reopened. */
  recentSupported: boolean;
  onOpenRecent: (recent: RecentFile) => void;
  onClearRecent: () => void;

  /** How many relative-path images the document uses (drives the hint text). */
  localImageCount: number;
  /** Name of the folder granted for relative image paths, if any. */
  imageFolderName?: string;
  /** False where the platform cannot let the user pick a folder. */
  imageFolderSupported: boolean;
  onPickImageFolder: () => void;
  onReloadImages: () => void;
  onClearImageFolder: () => void;
}

export function Sidebar(p: Props) {
  const t = useT();
  const minLevel = Math.min(6, ...p.outline.map((o) => o.level));

  return (
    <aside className="sidebar" aria-label={t("sidebar.label")}>
      <section aria-labelledby="outline-h">
        <h2 id="outline-h">{t("sidebar.outline")}</h2>
        {p.outline.length === 0 ? (
          <p className="muted">{t("sidebar.noHeadings")}</p>
        ) : (
          <ul className="outline">
            {p.outline.map((o) => (
              <li key={o.index} style={{ paddingLeft: `${(o.level - minLevel) * 12}px` }}>
                <button onClick={() => p.onJump(o)} title={o.text || t("outline.untitledHeading")}>{o.text || t("outline.untitledHeading")}</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="img-h">
        <h2 id="img-h">{t("sidebar.images")}</h2>
        {!p.imageFolderSupported ? (
          <p className="muted">{t("sidebar.noFolderPicker")}</p>
        ) : (
          <>
            <p className="muted">
              {p.imageFolderName
                ? t("sidebar.folderChosen", { name: p.imageFolderName })
                : p.localImageCount > 0
                  ? t("sidebar.folderNeeded", { n: p.localImageCount })
                  : t("sidebar.folderHint")}
            </p>
            <button className="side-button" onClick={p.onPickImageFolder}>
              {p.imageFolderName ? t("sidebar.changeFolder") : t("sidebar.pickFolder")}
            </button>
            {p.imageFolderName && (
              <div className="side-row">
                <button className="link-button" onClick={p.onReloadImages}>{t("sidebar.reloadImages")}</button>
                <button className="link-button" onClick={p.onClearImageFolder}>{t("sidebar.clearFolder")}</button>
              </div>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="recent-h">
        <h2 id="recent-h">{t("sidebar.recent")}</h2>
        {!p.recentSupported ? (
          <p className="muted">{t("sidebar.recentUnsupported")}</p>
        ) : p.recents.length === 0 ? (
          <p className="muted">{t("sidebar.recentEmpty")}</p>
        ) : (
          <>
            <ul className="recent">
              {p.recents.map((r) => (
                <li key={r.id}>
                  <button onClick={() => p.onOpenRecent(r)} title={`${r.name} (${new Date(r.openedAt).toLocaleString(getLanguage())})`}>
                    {r.name}
                  </button>
                </li>
              ))}
            </ul>
            <button className="link-button" onClick={p.onClearRecent}>{t("sidebar.recentClear")}</button>
          </>
        )}
      </section>
    </aside>
  );
}
