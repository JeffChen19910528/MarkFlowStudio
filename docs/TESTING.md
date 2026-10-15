# 測試

## 指令
```bash
npm test                                        # 全部(Vitest + jsdom)
npx vitest run src/tests/docx.test.ts           # 單一檔案
npx vitest run -t "undo reverts"                # 以名稱
npm run typecheck && npm run lint && npm run build
```

目前:27 個測試檔,395 個測試通過、5 個選用測試(真實 Chrome PDF)預設略過。

## 測試檔對應
| 檔案 | 內容 |
|---|---|
| `architecture.test.ts` | **分層規則**:依賴方向、無循環、瀏覽器 API 只在 `files/` 與 `platform/`、功能之間不互相 import、單檔不超過 300 行(訊息目錄除外)、**`i18n/` 之外沒有中文字面值**(見 [ARCHITECTURE.md](./ARCHITECTURE.md)) |
| `i18n.test.tsx` | 兩份訊息目錄 key 與 `{placeholder}` 一致、英文不含中文;語言偵測與記憶;非元件文字(檔名錯誤、轉換警告、匯出 HTML 的 `lang`)隨語言;整個 app 切換成英文後工具列、分頁、狀態列、側欄、匯出對話框都翻譯且沒有殘留中文;預設名稱分頁隨語言改名 |
| `document.test.ts` `workspace.test.ts` | 文件狀態、dirty 判定、字數統計;分頁模型(重用空白分頁、上限、關閉後啟用、未命名編號) |
| `files.test.ts` `recent.test.ts` | 副檔名、UTF-8、大小、取消、權限、寫入失敗(File System Access API 為 mock);IndexedDB 最近文件(fake-indexeddb) |
| `App.test.tsx` `AppPreview.test.tsx` `AppTabs.test.tsx` `AppImport.test.tsx` `AppImages.test.tsx` `Autosave.test.tsx` | 整個 app 的使用流程:編輯／儲存、預覽與檢視模式、主題與設定持久化、多分頁、大綱、最近文件、匯入、圖片資料夾、自動儲存、快捷鍵 |
| `render.test.ts` `themes.test.ts` | Markdown 渲染與消毒;主題對比、驗證與夾限、設定損毀恢復、主題操作 |
| `exporters.test.ts` `ExportDialog.test.tsx` | HTML／TXT、樣式分離、檔名驗證、拒絕覆寫來源、對話框流程(含 PDF 與 DOCX) |
| `pdf.test.ts` | `@page` 規則、頁面幾何、邊距驗證、CSS 跳脫、圖片取代、列印 iframe |
| `docx.test.ts` `exportImages.test.ts` | 解開 zip 檢查 OOXML(標題樣式、超連結關聯、編號、表格、字型、圖片、警告) |
| `importers.test.ts` | HTML／DOCX 匯入、偽裝檔案、**DOCX 往返** |
| `images.test.ts` `PreviewImages.test.tsx` | 圖片路徑安全(穿越、編碼、控制字元)、檔頭辨識、大小與像素限制;預覽不發請求、blob URL 快取與釋放 |
| `fixtures.test.ts` | `fixtures/sample.md` × 所有格式 × 7 主題 × 2 樣式 |
| `a11y.test.tsx` `Modal.test.tsx` | axe-core 無障礙檢查(各畫面與對話框);焦點陷阱、Esc、還原焦點;UI 色彩對比(WCAG AA) |
| `launcher.test.ts` `peCheck.test.ts` | 執行檔的本機伺服器(真實 HTTP:路徑穿越、Host 檢查、方法限制、安全標頭、生命週期);PE 結構檢查 |
| `realBrowser.pdf.test.ts` | **選用**:以真實 Chrome 列印 PDF 並檢查(見下) |

## 測試手法

UI 測試不用 `vi.mock` 替換模組,而是**依賴注入**:`tests/helpers/platform.tsx` 的 `makePlatform()` 提供一個假的 `Platform`(檔案、最近文件、列印的每個函式都是 `vi.fn`,最近文件在記憶體中實作),`renderApp(platform)` 用它渲染 `App`。要測真實的瀏覽器檔案寫入時,用 `browserPlatformWithFakePrinter()`(只假造列印對話框,檔案選擇器由測試提供 `window.showSaveFilePicker`)。

CodeMirror 在 jsdom 中無法接收 DOM 輸入,測試以 `EditorView.findFromDOM(...).dispatch(...)` 輸入文字。每個測試前請重建假平台,避免上一個失敗的測試遺留的 `mockXOnce` 汙染下一個。

## 真實瀏覽器檢查(選用)

jsdom 沒有版面引擎、真實焦點與顏色對比,以下兩項補足這一塊。

**1. 互動煙霧測試**(59 項,含中英文切換與英文介面的 axe 顏色對比)
```bash
npm run build
npx vite preview --port 4173 &
MARKFLOW_CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe" npm run smoke:browser
# 也可對打包好的執行檔執行:  node scripts/browser-smoke.mjs http://127.0.0.1:<埠號>/
```
`scripts/browser-smoke.mjs` 以 Chrome DevTools Protocol(Node 22 內建 WebSocket,無額外依賴)操作無頭 Chrome:真實的焦點、文字輸入、點擊。涵蓋分頁與各自的復原歷史、預覽與大綱、檢視模式、對話框焦點與 Esc、**圖片資料夾(以 OPFS 取得真實的目錄 handle)**、預覽不對相對／外部圖片發出請求、6 種視窗寬度下編輯器可用且無水平溢出、**含顏色對比的完整 axe 檢查**、favicon、無主控台錯誤。任何一項失敗即以非 0 結束。

它抓到過 jsdom 測不到的真實問題:窄視窗編輯器寬度為 0、1000 px 時編輯器過窄、兩個同名未命名分頁、缺少 favicon、頁面沒有 h1、工具列不在地標內。

**2. 真實 Chrome 列印 PDF**
```bash
MARKFLOW_CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe" npm test -- realBrowser
```
以 `--headless --print-to-pdf` 實際列印,檢查:是 `%PDF-` 且有 `%%EOF`、多頁、A4／Letter 橫向／自訂尺寸的 `MediaBox`(容許 1 pt 誤差,Chrome 會把頁面尺寸對齊到像素)、含內嵌字型、本機圖片真的成為 PDF 內的影像物件。未設環境變數時整檔略過。

## 已在真實 Chrome 155 驗證過的事項
(Windows,headless)
- 開發版、正式建置版與打包後的 `MarkFlowStudio.exe` 皆通過上述 49 項煙霧測試,無 CSP 違規。
- 列印版 HTML → PDF:A4 共 11 頁;每頁都有頁首、頁尾與「n / 11」頁碼;中文以內嵌的微軟正黑體輸出,文字可被正確抽取;表格跨頁時重複表頭、列不被切斷;長程式碼行自動換行;深色編輯主題搭配「匯出專用樣式」為白底;Letter 橫向為 279.4 × 215.9 mm。(以 PyMuPDF 抽取文字與頁面圖像觀察。)

## 自動化測試**沒有**涵蓋的部分
- 實際的檔案選擇器與下載行為(jsdom 沒有;File System Access API 為 mock;煙霧測試以 OPFS 與替換 `showDirectoryPicker` 間接驗證)。
- Firefox／Safari、macOS／Linux。
- DOCX 在 Word／LibreOffice 的外觀(只檢查封裝與 XML)。
- 螢幕閱讀器的實際朗讀。
- 打包執行檔在其他電腦上的行為(只在作者的 Windows 11 驗證;PE 結構以檢查器確認與原版 `node.exe` 一致)。

## 準則
- 不為了通過而刪除或弱化測試。
- PDF／DOCX 不只檢查副檔名或檔案存在,而是檢查內容結構。
- 修改 UI 或版面後,請跑一次 `npm run smoke:browser`。
