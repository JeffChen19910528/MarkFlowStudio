# 架構

MarkFlow Studio 是純前端應用(React + TypeScript + Vite + CodeMirror 6)。所有處理都在使用者的瀏覽器內完成,沒有後端、沒有網路請求。可另外打包成 Windows 單一執行檔，或 Tauri 桌面版安裝程式(見 [PACKAGING.md](./PACKAGING.md))。Tauri 殼(`src-tauri/`)目前只負責顯示網頁版，不提供原生指令；平台抽象層(`platform/`)仍是日後改用原生檔案對話框的接縫。

## 分層

由下而上;每一層只能依賴清單中的層。這些規則由 `src/tests/architecture.test.ts` 自動檢查,違反就會讓測試失敗。

| 層 | 內容 | 可依賴 |
|---|---|---|
| `i18n/` | 介面文字(繁中、英文兩份目錄)、`t()`、語言狀態;不依賴任何其他層,**任何層都可使用** | — |
| `shared/` | 純型別與純函式:`DocumentState`、`workspace`(分頁模型)、`FileRef`、`FolderRef`、`FileError`、`Status`、UTF-8 解碼、惰性 DOM 解析 | — |
| `themes/` | 主題資料、驗證與夾限、轉 CSS 變數 | shared |
| `images/` | 圖片領域邏輯:路徑安全、檔頭辨識、資料夾讀取、資料 URI | shared |
| `markdown/` | 唯一的 Markdown 渲染設定、標題大綱、圖片引用、共用 CSS | shared, images |
| `exporters/` | 純轉換器:HTML、TXT、PDF 列印文件、DOCX(`docx/` 資料夾)、檔名驗證 | shared, themes, images, markdown |
| `importers/` | 純轉換器:HTML／DOCX → Markdown | shared |
| `files/` | 瀏覽器檔案系統實作(File System Access API、下載／上傳後備、IndexedDB 最近文件) | shared |
| `platform/` | `Platform` 介面、React context、瀏覽器實作 | shared, files |
| `settings/` | 設定持久化與主題操作(純函式) | shared, themes, exporters |
| `components/` | 通用 UI 元件:`Modal`、`NumberField`、`StatusBanner` | shared |
| `editor/` | CodeMirror 封裝(單一持久的 view) | — |
| `preview/` | 預覽元件與圖片載入 hook | shared, images, markdown |
| `features/` | 每個功能一個資料夾,內含該功能的 hooks 與元件 | 以上各層;**功能之間不可互相 import** |
| `app/` | 組合根:`App.tsx` 與少數 app 級 hooks | 全部 |

附加規則(同樣有測試):沒有檔案層或資料夾層的 import 循環;瀏覽器的檔案與儲存 API(`showOpenFilePicker`、`indexedDB`、`FileSystemFileHandle`…)只能出現在 `files/` 與 `platform/`;`features/` 只能經由 `usePlatform()` 取得平台,不可 import `platform/browser` 或 `files/`;任何原始碼檔案不超過 300 行;轉換器不可 import React。

## 資料流

```
                         ┌───────────────────── app/App.tsx(組合) ─────────────────────┐
 使用者操作 ─► features/*  ─► hooks ──► Platform(介面)──► platform/browser ─► files/*
 (按鈕、對話框)            useWorkspace   files / recents / printer         (檔案選擇器、IndexedDB、列印)
                           useDocumentActions
                                │ 文件文字
              ┌─────────────────┼──────────────────────────┐
              ▼                 ▼                          ▼
          editor/Editor     preview/Preview            exporters/*  ◄── images/(讀到的圖片)
          (CodeMirror)      markdown/render ─► DOMPurify  html · txt · pdf · docx
                                   ▲                          │ 同一個 markdown-it 解析器、同一份 CSS
                  themes/ ─────────┴──────────────────────────┘
 匯入檔 ─► importers/(HTML: DOMPurify→Turndown;DOCX: mammoth→同一條 HTML 路徑)─► 新的未儲存文件 + 轉換報告
```

## 介面語言(`i18n/`)

所有使用者看得到的文字都在 `i18n/zhTW.ts`(來源)與 `i18n/en.ts`;`en` 的型別是 `Record<MessageKey, string>`,少一個 key 就無法編譯。`t(key, 參數)` 讀取模組層級的目前語言(存在 `localStorage["markflow.language"]`,第一次依 `navigator.language`:中文系 → 繁中,其餘 → 英文)。因為檔案錯誤、轉換器警告等文字產生在非 React 程式碼中,語言狀態不放在 React state;元件以 `useT()`(`useSyncExternalStore`)訂閱,語言切換時整棵樹重新渲染。規則:

- 原始碼中除了 `i18n/` 之外**不得有中文字面值**(`architecture.test.ts`;註解除外)。
- 翻譯文字不可在模組載入時就算好(語言會改變),要在使用時呼叫 `t()`;例如 `Exporter.label` 是 getter。
- 訊息建立當下的語言就是它的語言:已顯示的狀態訊息不會在切換語言時改變;編輯器的 aria-label、預覽的提示文字、匯出對話框的檔名錯誤等會跟著更新。
- 尚未儲存、仍用預設名稱的分頁("未命名 2.md" ↔ "Untitled 2.md")會在切換語言時改名(`relocalizeUntitled`);已儲存或開啟的檔案不動。
- 匯出文件(HTML 的 `lang`、替代文字、警告)使用匯出當下的介面語言。
- 打包版啟動器的少數錯誤訊息依系統語言;`docs/` 底下的開發者文件只有繁體中文。

## 平台抽象(`platform/`)

`Platform = { files: FileApi, recents: RecentStore, printer: Printer }`,定義在 `platform/types.ts`。UI 與狀態 hooks 只認這些介面:

- 檔案以不透明的 `FileRef`(名稱 + `isSameEntry`)表示,資料夾以 `FolderRef` 表示;瀏覽器實作中它們就是 `FileSystemFileHandle`／`FileSystemDirectoryHandle`,型別轉換只發生在 `platform/browser.ts`。
- `PlatformProvider` 提供其他實作(測試的假平台、日後的桌面版);沒有 provider 時使用 `browserPlatform`。
- 效果:測試不需要 `vi.mock` 模組路徑,改用 `makePlatform()`(`tests/helpers/platform.tsx`)取得一個每個函式都是 `vi.fn` 的假平台。

## `App` 如何組成

`App.tsx` 只做組裝:取得平台 → 建立各個 hook → 把狀態與動作交給呈現元件。

| Hook / 元件 | 責任 |
|---|---|
| `useWorkspace` | 開啟的文件(分頁)的狀態與操作;不認識檔案或平台。非同步流程用 `latest()` 取得最新狀態 |
| `useDocumentActions` | 所有涉及檔案的流程:儲存、開啟、匯入、重開最近文件、關閉前詢問、選圖片資料夾。只依賴 `FileApi` 介面 |
| `useRecentFiles` / `useAutosave` | 最近文件清單;定時靜默儲存 |
| `useEditorCommands` | 唯一接觸 CodeMirror view 的地方 |
| `useSettings` `useStatus` `useScrollSync` `useWindowGuards` | 設定持久化;狀態訊息;同步捲動;標題與關閉前警告 |
| `Toolbar` `TabBar` `StatusBar` `Sidebar` `UnsavedChangesDialog` … | 純呈現元件,資料與回呼全由 props 傳入 |

## 重要設計決定

- **單一渲染設定。** 預覽、HTML、PDF 都呼叫 `renderMarkdown`;TXT、DOCX 使用同一個解析器的 token。同一份 Markdown 在各處語法解讀一致。
- **編輯樣式與匯出樣式分離。** `ExportStyle`:`"print"` 固定使用 Paper White 色彩但保留字型與字級;`"follow"` 跟隨目前主題。
- **匯出器有兩種形狀。** 文字格式同步回傳 `ExportOutput`;二進位格式(DOCX)非同步回傳 `BinaryOutput`,並在對話框中丟棄過期結果。重型函式庫(`docx`、`jszip`、`mammoth`、`turndown`)以動態 `import()` 載入。
- **PDF = 瀏覽器列印。** 沒有 PDF 產生器;`pdf.ts` 產生排版好的 HTML,`platform/browserPrint.ts` 用隱藏 iframe 呼叫列印。程式無法得知使用者是否真的存檔,所以只回報「已開啟列印對話框」。
- **圖片需要使用者授權一個資料夾。** 瀏覽器無法憑 Markdown 檔得知圖片位置。每個分頁各有一個 `imageFolder`(唯讀);相對路徑只能解析到該資料夾內(拒絕 `..` 逃出、絕對路徑);型別由檔案內容判斷而非副檔名;限制大小與像素。預覽用 blob URL,匯出內嵌為資料 URI(DOCX 用 `ImageRun`)。
- **所有 HTML 處理都用惰性 DOM。** `inertBody()`(`DOMParser`)不會載入任何資源;`div.innerHTML = …` 即使沒掛到頁面,仍會對 `<img src>` 發出請求。預覽進入頁面前先移除所有 `<img>` 的 `src`。
- **編輯器:單一持久的 `EditorView`**,切換分頁時以 `view.setState` 換入該文件各自的 `EditorState`(文字、游標、復原歷史)。
- **匯入結果一律是新的未儲存文件**,絕不覆寫來源;開啟已經開著的檔案是切換而非重讀,以免蓋掉未儲存的編輯。
- **自動儲存只做靜默寫回**:只寫已連結檔案的有變更分頁,不彈對話框、不重置編輯器。

## 已知結構性限制
- 分頁不會在重新載入後還原(只持久化設定與最近文件);圖片資料夾也不持久化。
- 最近文件與圖片資料夾依賴 File System Access API(Chromium 系瀏覽器)。
- 主 bundle 約 640 kB(CodeMirror + markdown-it + DOMPurify + React);語言高亮與 DOCX 相關程式碼已分割。
