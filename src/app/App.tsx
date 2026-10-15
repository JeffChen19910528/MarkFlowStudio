import { type CSSProperties, useMemo, useState } from "react";
import { Editor } from "../editor/Editor";
import { StatusBanner } from "../components/StatusBanner";
import { ExportDialog } from "../features/export/ExportDialog";
import { ImportReport } from "../features/import/ImportReport";
import { SettingsPanel } from "../features/settings/SettingsPanel";
import { StatusBar } from "../features/shell/StatusBar";
import { Toolbar } from "../features/shell/Toolbar";
import { ShortcutsDialog } from "../features/shortcuts/ShortcutsDialog";
import { Sidebar } from "../features/sidebar/Sidebar";
import { useDocumentInsights } from "../features/sidebar/useDocumentInsights";
import { TabBar } from "../features/workspace/TabBar";
import { UnsavedChangesDialog } from "../features/workspace/UnsavedChangesDialog";
import { useAutosave } from "../features/workspace/useAutosave";
import { useDocumentActions, useSaveShortcut } from "../features/workspace/useDocumentActions";
import { useRecentFiles } from "../features/workspace/useRecentFiles";
import { useWorkspace } from "../features/workspace/useWorkspace";
import type { OutlineItem } from "../markdown/outline";
import { useT } from "../i18n/react";
import { usePlatform } from "../platform/PlatformContext";
import { Preview } from "../preview/Preview";
import { scrollPreviewToHeading } from "../preview/scrollToHeading";
import { computeStats, isDirty } from "../shared/document";
import { activeTab } from "../shared/workspace";
import { themeToCssVars } from "../themes/themes";
import { useEditorCommands } from "./useEditorCommands";
import { useScrollSync } from "./useScrollSync";
import { useSettings } from "./useSettings";
import { useStatus } from "./useStatus";
import { useWindowGuards } from "./useWindowGuards";

/** Below this width the side panels start collapsed so the editor keeps the space. */
const isWideScreen = () => typeof window.matchMedia !== "function" || window.matchMedia("(min-width: 1101px)").matches;

/**
 * Wires the pieces together: it picks the platform, creates the state hooks, and hands state and
 * actions to presentational components. It contains no file, editor or export logic of its own.
 */
export function App() {
  // Subscribing here re-renders the whole tree when the interface language changes.
  const t = useT();
  const platform = usePlatform();
  const { settings, updateSettings, storageOk } = useSettings();
  const { status, setStatus, reportError } = useStatus();
  const editor = useEditorCommands();
  const workspace = useWorkspace();
  const recents = useRecentFiles(platform.recents);
  const actions = useDocumentActions({
    workspace,
    files: platform.files,
    recents,
    status: { setStatus, reportError },
    focusEditor: editor.focus,
  });

  const { ws, active } = workspace;
  const doc = active.doc;
  const dirty = isDirty(doc);
  const linked = active.handle !== undefined;
  const stats = useMemo(() => computeStats(doc.markdown), [doc.markdown]);
  const insights = useDocumentInsights(doc.markdown);

  const [previewEl, setPreviewEl] = useState<HTMLDivElement | null>(null);
  /** Bumped to make the preview re-read images from disk. */
  const [imageReload, setImageReload] = useState(0);
  const [showSidebar, setShowSidebar] = useState(isWideScreen);
  const [showSettings, setShowSettings] = useState(isWideScreen);
  const [showExport, setShowExport] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const { viewMode, syncScroll } = settings;
  useWindowGuards(doc.title, dirty, workspace.anyUnsaved);
  useScrollSync(editor.view, previewEl, viewMode === "split" && syncScroll);
  useAutosave({
    enabled: settings.autosave,
    seconds: settings.autosaveSec,
    workspace,
    isBusy: actions.isBusy,
    saveTab: actions.saveTab,
  });
  useSaveShortcut(actions.saveActive, actions.isBusy);

  const jumpTo = (item: OutlineItem) => {
    editor.jumpToLine(item.line, viewMode !== "preview");
    scrollPreviewToHeading(previewEl, item.index);
  };

  const autosaveText = !settings.autosave
    ? null
    : !linked
      ? t("status.autosavePending")
      : active.autoSavedAt
        ? t("status.autosaveAt", { time: active.autoSavedAt })
        : t("status.autosaveOn");

  return (
    <div className="app" style={themeToCssVars(settings.theme) as CSSProperties}>
      <header>
        <h1 className="sr-only">MarkFlow Studio</h1>
        <Toolbar
          busy={actions.busy}
          viewMode={viewMode}
          syncScroll={syncScroll}
          sidebarOpen={showSidebar}
          settingsOpen={showSettings}
          onNew={actions.newDocumentTab}
          onOpen={() => void actions.openFile()}
          onImport={() => void actions.importFile()}
          onSave={() => void actions.saveActive(false)}
          onSaveAs={() => void actions.saveActive(true)}
          onExport={() => setShowExport(true)}
          onUndo={editor.undo}
          onRedo={editor.redo}
          onSearch={editor.openSearch}
          onViewMode={(mode) => updateSettings({ ...settings, viewMode: mode })}
          onSyncScroll={(enabled) => updateSettings({ ...settings, syncScroll: enabled })}
          onToggleSidebar={() => setShowSidebar((v) => !v)}
          onToggleSettings={() => setShowSettings((v) => !v)}
          onShortcuts={() => setShowShortcuts(true)}
        />
        <TabBar
          tabs={ws.tabs.map((tab) => ({ id: tab.doc.id, title: tab.doc.title, dirty: isDirty(tab.doc) }))}
          activeId={ws.activeId}
          busy={actions.busy}
          onActivate={workspace.activateTab}
          onClose={actions.requestClose}
          onNew={actions.newDocumentTab}
        />
      </header>

      {status && <StatusBanner status={status} onDismiss={() => setStatus(null)} />}

      <main className="workspace">
        {showSidebar && (
          <Sidebar
            outline={insights.outline}
            onJump={jumpTo}
            recents={recents.recents}
            recentSupported={recents.supported}
            onOpenRecent={(r) => void actions.openRecent(r)}
            onClearRecent={() => void recents.clear()}
            localImageCount={insights.localImageCount}
            imageFolderName={active.imageFolder?.name}
            imageFolderSupported={platform.files.hasFolderPicker()}
            onPickImageFolder={() => void actions.pickImageFolder()}
            onReloadImages={() => setImageReload((n) => n + 1)}
            onClearImageFolder={actions.clearImageFolder}
          />
        )}
        <div className="pane editor-pane" hidden={viewMode === "preview"}>
          <Editor
            docId={ws.activeId}
            initialValue={doc.markdown}
            store={workspace.editorStates}
            onChange={workspace.editActive}
            onReady={editor.onReady}
          />
        </div>
        {viewMode !== "edit" && (
          <div className="pane preview-pane">
            <Preview markdown={doc.markdown} onElement={setPreviewEl} imageFolder={active.imageFolder} imageReload={imageReload} />
          </div>
        )}
        {showSettings && (
          <SettingsPanel settings={settings} onChange={updateSettings} storageOk={storageOk} autosaveActive={linked} />
        )}
      </main>

      <StatusBar
        stats={stats}
        autosaveText={autosaveText}
        saveState={actions.busy ? "busy" : dirty ? "unsaved" : "saved"}
        compatMode={!platform.files.hasNativeFileAccess()}
      />

      {showShortcuts && <ShortcutsDialog onClose={() => setShowShortcuts(false)} />}
      {actions.importReport && <ImportReport {...actions.importReport} onClose={actions.dismissImportReport} />}

      {showExport && (
        <ExportDialog
          markdown={doc.markdown}
          title={doc.title}
          theme={settings.theme}
          initialFormat={settings.exportFormat}
          initialStyle={settings.exportStyle}
          initialPdf={settings.pdf}
          getSourceFile={() => activeTab(workspace.latest()).handle}
          imageFolder={active.imageFolder}
          onRemember={(exportFormat, exportStyle, pdf) => updateSettings({ ...settings, exportFormat, exportStyle, pdf })}
          onClose={() => setShowExport(false)}
          onDone={(kind, text) => {
            setShowExport(false);
            setStatus({ kind, text });
          }}
        />
      )}

      {actions.closingTab && (
        <UnsavedChangesDialog title={actions.closingTab.doc.title} onChoose={(c) => void actions.resolveClosing(c)} />
      )}
    </div>
  );
}
