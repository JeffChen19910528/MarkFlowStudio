# Changelog

版本為內部階段版本(尚未正式發佈)。

## Phase 10 — 中英文介面與 README
**新增**
- **介面語言切換**(繁體中文／English):工具列最右邊的選單,即時生效、會被記住,第一次依瀏覽器語言決定。所有介面文字、錯誤訊息、轉換警告、匯出內容的替代文字與 HTML `lang` 都隨語言。新增 `src/i18n/`(兩份型別一致的訊息目錄、`t()`、`useT()`)。
- 未儲存且仍使用預設名稱的分頁隨語言改名(未命名 2.md ⇄ Untitled 2.md)。
- `README.en.md`(英文版 README),`README.md` 加上切換連結與語言說明。`使用說明.txt` 與啟動器錯誤訊息也有英文。
- 架構測試新增規則:`i18n/` 之外不得有中文字面值。

**驗證**:單元／整合測試 415 個通過;真實 Chrome 煙霧測試 59/59(新增 10 項:語言切換、英文介面無殘留中文、英文介面的 axe 顏色對比、選擇被記住)。

**限制**:`docs/` 的開發者文件只有繁體中文;已顯示的狀態訊息不會在切換語言時重新翻譯;只有兩種語言(新增語言需補一份完整目錄)。

## Phase 9 — Tauri 桌面版
**新增**
- `src-tauri/`:最小的 Tauri 2 殼(WebView2),不註冊原生指令、不授予權限。`npm run desktop` 產生 NSIS 安裝程式(約 2 MB)與免安裝執行檔(約 4 MB)。
- `browser-smoke.mjs` 新增 `MARKFLOW_APP_EXE` 模式,在 Tauri 視窗內跑同一組 49 項檢查。

**驗證**:建置出的 exe 與實際安裝後的程式皆 49/49(安裝後連跑 10 次無失敗);靜默安裝／解除安裝乾淨。**未驗證**:WebView2 中的列印對話框。

## Phase 8 — 圖片、打包成執行檔、重構
**新增**
- **圖片資料夾**:為每份文件授權一個資料夾(唯讀),相對路徑圖片即可在預覽顯示,並內嵌到 HTML、PDF、DOCX(PNG／JPEG／GIF;DOCX 不含 WebP)。路徑限制在所選資料夾內、以檔頭判斷型別、限制大小與像素。
- **單一執行檔** `MarkFlowStudio.exe`(Node SEA):雙擊即用,不需安裝;只綁 127.0.0.1;以 Edge／Chrome 的應用程式視窗開啟;重複啟動會重用;視窗關閉後自動結束。含圖示與版本資訊、`使用說明.txt`、第三方授權聲明與 zip。`npm run package`。
- `scripts/pe-check.mjs`:檢查執行檔結構(重定位表)。`scripts/browser-smoke.mjs`:真實 Chrome 煙霧測試(49 項)。
- `docs/PACKAGING.md`。

**重構**(行為不變,386 個既有測試維持通過)
- 分層與依賴規則,並以 `architecture.test.ts` 強制:依賴方向、無檔案／資料夾循環、瀏覽器檔案 API 只在 `files/` 與 `platform/`、功能之間不互相 import、單檔 ≤ 300 行。
- 新增 `platform/` 抽象層(`FileApi`、`RecentStore`、`Printer`)與依賴注入;程式碼只認不透明的 `FileRef`／`FolderRef`,不再認識瀏覽器的 handle。測試改用 `makePlatform()`,不再 `vi.mock` 模組路徑。
- `App.tsx` 從 515 行(依賴 17 個模組)拆成約 200 行的組合根 + 各司其職的 hooks(`useWorkspace`、`useDocumentActions`、`useRecentFiles`、`useAutosave`、`useEditorCommands`…)與純呈現元件(`Toolbar`、`TabBar`、`StatusBar`…)。
- 功能 UI 歸入 `features/`,`exporters/` 與 `importers/` 成為不含 React 的純轉換器。
- `files/fileService.ts`(291 行)拆成 `documents`、`exportFile`、`importPicker`、`imageFolder`、`browser`、`text`;`files/images.ts` 拆成 `images/` 與 `markdown/imageRefs`;`exporters/docx.ts`(395 行)拆成 `docx/` 五個檔案;`ExportDialog` 拆出 `useImageLoading`、`useExportOutput`、`OutputPreview`;`settings` 分成持久化與 `themeOps`。
- 消除目錄層級的循環依賴(`files ⇄ preview`、`settings ⇄ exporters`、`files ⇄ platform`)。

**修正**
- **執行檔重定位表被毀**:以純 JS 編輯 PE 資源會讓程式在其他電腦可能無法啟動;改用 `rcedit` 並在建置時檢查。
- 所有 HTML 處理改用惰性 `DOMParser`:`div.innerHTML` 即使未掛載也會讓瀏覽器對圖片網址發出請求。預覽改為先移除 `<img>` 的 `src`。
- 頁面缺少 h1(axe)。

**驗證**:395 個測試通過(另有 5 個選用的真實 Chrome PDF 測試);真實 Chrome 對網頁版與執行檔各跑 49/49;執行檔重複啟動、視窗關閉後自動結束皆驗證。

## Phase 7 — 多文件、最近文件、大綱、真實瀏覽器驗證
**新增**
- 多文件分頁:各自的復原歷史／游標／未儲存狀態;新增、開啟、匯入皆開新分頁;未命名文件自動編號;關閉有變更的分頁會詢問;開啟已開啟的檔案改為切換;上限 20 個。
- 最近文件(IndexedDB,僅檔名／時間／handle):重新授權、檔案消失時自動移除、可清除。
- 側欄與標題大綱(點選跳到該行)。
- `public/favicon.svg`。
- `scripts/browser-smoke.mjs`(`npm run smoke:browser`):用 Chrome DevTools Protocol 操作真實 Chrome,40 項檢查,含完整 axe(顏色對比)。

**修正(皆由真實瀏覽器檢查發現)**
- ≤ 900 px 時編輯器寬度為 0、側欄與設定面板佔滿畫面 → 改為垂直堆疊,斷點 1100 px,窄螢幕預設收起側欄與設定。
- 1000 px 時編輯器只有 250 px。
- 兩個未命名分頁標題相同。
- 缺少 favicon(404)。
- 工具列不在地標(landmark)內 → 包進 `<header>`。
- 設定面板出現水平捲軸。

**變更**
- 「新增／開啟／匯入」不再詢問是否放棄目前文件(因為不再取代它);改為在**關閉**有變更的分頁時詢問。
- 自動儲存涵蓋所有已連結檔案且有變更的分頁。
- 單一持久的 `EditorView`,以 `setState` 切換文件(取代 `key={doc.id}` 重新掛載)。

**驗證**:261 個單元／整合測試通過(另有 4 個選用的真實 Chrome PDF 測試);真實 Chrome 155 煙霧測試 40/40。

## Phase 6 — 穩定性、安全、可及性(部分)
**新增**
- 自動儲存(可設定間隔 5–600 秒):靜默寫回已連結的檔案,保留復原歷史;未連結檔案時不執行。
- 快捷鍵說明對話框。
- `Modal` 元件:焦點陷阱、Esc 關閉、關閉後還原焦點;三個既有對話框改用它。
- 程式碼分割:`docx`、`jszip`、`mammoth`、`turndown` 改為動態載入。
- `docs/`:ARCHITECTURE、SECURITY、TESTING、FORMAT-SUPPORT。
- 測試:axe-core 無障礙檢查、UI 色彩對比、自動儲存、Modal、選用的真實 Chrome PDF 檢查。

**變更**
- 工具列由 `<header role="toolbar">` 改為 `<div role="toolbar">`(axe 指出 `header` 不允許該角色)。
- PDF:相對路徑與外部圖片改為「[圖片:說明]」文字,不再列印破圖圖示(以真實 Chrome 列印發現)。

**驗證**
- 以真實 Chrome 155 驗證 app 渲染與列印出的 PDF(見 `docs/TESTING.md`)。

**未完成**:Tauri 桌面版與打包、跨平台測試、版本資訊(最近文件與多文件已在 Phase 7 完成)。

## Phase 5 — DOCX 與匯入
- DOCX 匯出(`docx`);HTML／DOCX 匯入(Turndown／mammoth)與轉換報告;格式支援矩陣;`fixtures/`。

## Phase 4 — PDF(瀏覽器列印)
- PDF 選項(尺寸、方向、邊距、頁碼、頁首頁尾、背景、連結、程式碼換行)、列印版預覽、分頁規則。

## Phase 3 — HTML 與 TXT 匯出
- 匯出對話框、檔名驗證、匯出專用樣式、拒絕覆寫來源。

## Phase 2 — 預覽與主題
- 即時預覽、同步捲動、7 個內建主題與自訂主題、字型／版面設定、設定持久化。

## Phase 1 — 編輯器
- 開啟／儲存／另存、復原重做、搜尋取代、未儲存提示、字數統計。
