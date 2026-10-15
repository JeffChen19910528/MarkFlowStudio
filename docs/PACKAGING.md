# 打包成執行檔

目標:讓不懂程式的人雙擊就能用。產出 `release/MarkFlowStudio.exe`(約 84 MB,單一檔案)與壓縮檔 `release/MarkFlowStudio-Windows-x64-v<版本>.zip`(約 32 MB,內含執行檔、使用說明、第三方授權聲明)。

```bash
npm run package          # 先建置網頁版,再打包
npm run package:fast     # 沿用現有的 dist/
npm run package -- --console   # 保留主控台視窗(除錯用)
```

## 運作方式

使用 Node 的 *single executable application*(SEA):

1. 把整個建置好的網頁 app(`dist/`,122 個檔案)與啟動器腳本做成 SEA blob。
2. 複製 `node.exe`,用 `rcedit` 設定圖示與版本資訊,再用 `postject` 注入 blob。
3. 把 PE 的子系統改為 Windows GUI,執行時不會出現黑色主控台視窗。
4. 用 `scripts/pe-check.mjs` 檢查執行檔結構(見下),不通過就讓建置失敗。
5. 產生 `使用說明.txt`、`THIRD-PARTY-NOTICES.txt`(所有正式依賴的授權文字)與 zip。

執行時(`scripts/launcher.cjs` + `scripts/launcher-core.cjs`):

- 在 `127.0.0.1` 啟動一個只服務打包內容的小伺服器,固定從 47831 開始找埠號(瀏覽器的設定與最近文件綁定網址來源,埠號不固定會讓設定消失)。
- 用 Edge(Windows 內建)或 Chrome 以 `--app=` 模式開啟,看起來像獨立程式。找不到時退回系統預設瀏覽器。
- 已經在執行時再次啟動,只會多開一個視窗然後結束。
- 網頁會定時回報「我還開著」,離開時送出 `bye`;最後一個視窗關閉後約 10 秒伺服器自行結束(崩潰的頁面 3 分鐘後視為已離開;背景頁面被瀏覽器節流到每分鐘一次也不會被誤判)。
- 沒有視窗可以顯示錯誤,所以致命錯誤以系統對話框顯示,詳細內容寫入 `%LOCALAPPDATA%\MarkFlowStudio\launcher.log`。

環境變數(測試與進階用途):`MARKFLOW_NO_BROWSER=1`、`MARKFLOW_BROWSER`、`MARKFLOW_BROWSER_ARGS`、`MARKFLOW_PORTS`、`MARKFLOW_IDLE_MS`、`MARKFLOW_BYE_GRACE_MS`、`MARKFLOW_STARTUP_MS`、`MARKFLOW_DIST`(開發模式:直接用 `node scripts/launcher.cjs` 服務 `dist/`)。

## 伺服器的安全設計

只綁 `127.0.0.1`;檢查 `Host` 標頭(防 DNS rebinding);只提供清單中的檔案,以完整鍵值查找,沒有任何檔案系統路徑處理,因此不可能路徑穿越;只允許 GET／HEAD(與同源的 `bye` 信標);回應帶 CSP(含 `frame-ancestors 'none'`)、`nosniff`、`no-referrer`、`same-origin` 資源政策。`launcher.test.ts` 以真實 HTTP 連線測試以上每一項。

## 為什麼要檢查 PE 結構(一個真實發生過的問題)

最初用純 JavaScript 的 PE 編輯器(`resedit`)改圖示,結果**重定位表被毀掉**(0 個區塊,原版 `node.exe` 有 672 個區塊、82,854 筆項目)。程式在作者的電腦上照常執行(剛好載入在偏好位址,不需要重定位),但在其他電腦、被載入到不同位址時可能無法啟動。改用呼叫 Windows 官方資源 API 的 `rcedit` 後,重定位表與原版完全一致。

`scripts/pe-check.mjs` 解析 PE 標頭、區段與重定位表,並與原版 `node.exe` 比對;`build-exe.mjs` 在輸出前自動執行,`peCheck.test.ts` 以刻意損壞的副本確認檢查器抓得到。

## 驗證

- 單元:`launcher.test.ts`(24 項,真實 HTTP)、`peCheck.test.ts`。
- 實際執行檔(手動,Windows 11 + Chrome 155):以 GUI 模式啟動並回應;以真實 Chrome 對執行檔跑 `scripts/browser-smoke.mjs` 完整 49 項;`MARKFLOW_BROWSER` 指向 Chrome 時能以 `--app` 開啟正確網址;第二次啟動重用既有實例並結束;視窗(瀏覽器程序)被關閉後伺服器在約 10 秒內自行結束;圖示與版本資訊正確。

## 已知限制

- 目前只在 Windows x64 建置與驗證。腳本的其他平台分支(macOS／Linux 開瀏覽器、SEA 注入)**未經測試**。
- 執行檔**沒有數位簽章**,Windows SmartScreen 第一次會警告(`使用說明.txt` 有說明)。簽章需要購買憑證。部分防毒軟體可能對任何 SEA 執行檔誤報。
- 內含完整 Node.js 執行環境,所以約 84 MB。
- 沒有安裝程式或自動更新;解除安裝就是刪除資料夾。
- SEA 在 Node 22 仍屬實驗性功能(已用 `disableExperimentalSEAWarning` 關閉警告);升級 Node 時需重新驗證。

## 桌面版(Tauri)

`src-tauri/` 是最小的 Tauri 2 殼:視窗載入 `dist/`(網頁版建置結果),用系統的 WebView2 顯示。Rust 端除了建立視窗什麼都沒做,沒有註冊指令,`capabilities/default.json` 沒有任何權限;CSP 與 `index.html` 相同(兩處要保持一致)。檔案開啟／儲存、最近文件、圖片資料夾仍使用 WebView2 內建的 File System Access API,所以行為與網頁版一致。

```bash
npm run desktop        # 需要 Rust(MSVC)與 Visual Studio 的「使用 C++ 的桌面開發」工作負載
npm run desktop:dev    # 開發模式(tauri dev)
```

輸出:`release/MarkFlowStudio-Setup-v<版本>.exe`(NSIS,每位使用者安裝,不需系統管理員權限,約 2 MB)與 `release/MarkFlowStudio-Desktop.exe`(免安裝,約 4 MB)。第一次建置會下載 NSIS 工具並編譯約 1.4 GB 的 `src-tauri/target/`(已不在 lint/測試範圍)。

### 驗證(Windows 11,WebView2 / Edge 155)
- `MARKFLOW_APP_EXE=<exe> npm run smoke:browser` 以 WebView2 遠端除錯連到真實視窗,跑同一組檢查(當時 49 項,現為 59 項)(含 axe、圖片資料夾、各種視窗寬度):對建置出的 exe 與「實際安裝後的程式」皆通過(安裝後連跑 10 次 10 次通過)。
- 安裝程式以靜默模式安裝到暫存資料夾、執行,再以其解除安裝程式移除,資料夾與登錄項目皆清乾淨。

### 已知限制
- **列印對話框未驗證**:PDF 匯出走 `window.print()`;在 WebView2 中是否能正常叫出列印對話框沒有實際測試(對話框會擋住自動化)。若有問題請回報,可改為 Rust 端的 WebView2 列印。
- 沒有檔案關聯(雙擊 `.md` 用本程式開啟)、沒有單一執行個體限制、沒有自動更新。
- 沒有數位簽章,SmartScreen 會警告。僅在 Windows x64 建置與測試;macOS／Linux 未試。
- 需要 WebView2 執行環境(Windows 11 內建;Windows 10 缺少時安裝程式會下載)。
