# 安全與隱私

範圍:純前端 Web 版,以及打包後的 `MarkFlowStudio.exe`(Windows)。最後審查:重構與打包之後。這是我(開發代理)依程式碼與測試做的審查,**不是獨立的第三方安全稽核**。

## 資料處理
- 文件只在瀏覽器記憶體與使用者選取的檔案中處理,**沒有任何網路請求**(CSP 也不允許;見下)。
- `localStorage` 只存設定(主題、檢視模式、匯出與自動儲存選項),**不存文件內容或路徑**。
- 「最近文件」存在 IndexedDB:只有檔名、最後開啟時間與 `FileSystemFileHandle`(瀏覽器不提供路徑)。**不含文件內容。** handle 本身不授予存取權:重新開啟時瀏覽器會要求使用者重新授權,所以持有這份資料庫的人無法在沒有使用者同意下讀取檔案。使用者可在側欄一鍵清除。
- 沒有遙測。網頁 app 不寫日誌;打包版的啟動器只把運作訊息(網址、錯誤)寫到 `%LOCALAPPDATA%\MarkFlowStudio\launcher.log`(超過 200 KB 就清空),**不含文件內容**。
- 只讀寫使用者在檔案對話框選取的檔案(File System Access API 的授權模型)。

## 內容安全政策(CSP)
`index.html` 設定:`default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:`。
- 不允許內嵌或外部腳本、`connect-src`(不能 fetch/XHR)、外部圖片與字型。`'unsafe-inline'` 僅用於樣式(CodeMirror 與以 CSS 變數套用主題所需)。`blob:` 只用於預覽使用者所選資料夾中的本機圖片(由程式自己建立的 blob URL)。
- 打包版的本機伺服器另外以 HTTP 標頭送出等效的 CSP,並加上 `object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`。
- 於真實 Chrome 155 驗證:開發版與正式建置版皆正常渲染,沒有 CSP 違規。
- 匯出的 HTML 內嵌自己的 CSP:`default-src 'none'; img-src https: data:; style-src 'unsafe-inline'`(無腳本)。

## 不可信內容
| 來源 | 防護 |
|---|---|
| Markdown 內的原始 HTML | `markdown-it` 設 `html:false`(以文字顯示),輸出再經 DOMPurify;禁用 `style`、表單、`iframe`、`object`、`embed` 等 |
| 連結 | markdown-it 拒絕 `javascript:`／`vbscript:`／`data:` 連結;連結加 `rel="noopener noreferrer"` |
| 匯入的 HTML | 先以 `DOMParser` 檢查(不插入頁面),再 DOMPurify 消毒,最後 Turndown 轉為 Markdown;結果在預覽時又經過一次消毒 |
| 匯入的 DOCX | 大小上限 20 MB;檢查 zip 簽章與 `word/document.xml`;依宣告的解壓縮大小做**盡力而為**的炸彈防護(上限 200 MB;宣告值可被偽造,非完整保證);圖片不匯入 |
| 檔案內容與副檔名 | 副檔名與實際位元組都檢查(zip 改名成 `.html` 會被拒絕);文字檔嚴格 UTF-8、上限 5 MB |
| 匯出檔名 | 禁止非法字元、控制字元、結尾句點／空白、Windows 保留名、過長 |
| PDF 頁首／頁尾文字 | 以 `cssString` 跳脫後才放入 CSS 字串,測試涵蓋跳出字串／規則的嘗試 |

## 圖片與資料夾授權
文件中的相對路徑圖片需要使用者為該文件授權**一個資料夾**(`showDirectoryPicker`,唯讀)。圖片檔案內容視為不可信輸入:

| 威脅 | 防護 |
|---|---|
| 路徑穿越(`../`、`%2e%2e`、`\`、控制字元、絕對路徑、`file:` 等) | `normalizeImagePath` 一律拒絕任何會離開所選資料夾的路徑;被拒絕時**完全不碰檔案系統**(測試以間諜物件驗證) |
| 副檔名偽裝(把腳本或 HTML 命名為 `.png`) | 型別由檔案**內容**(魔術位元組)判斷,不信副檔名;內容不是圖片就拒絕 |
| SVG 內含腳本 | 不支援 SVG(也不支援任何非 PNG／JPEG／GIF／WebP) |
| 超大檔案與解壓縮炸彈式圖片 | 單檔 5 MB、單次 100 張、總計 30 MB、50,000,000 像素上限 |
| 預覽時瀏覽器自行對 `<img src>` 發出請求(洩漏文件內容、追蹤像素) | 進入頁面前先移除所有 `<img>` 的 `src`;本機圖片改由程式讀取後以 blob URL 顯示;外部圖片一律封鎖。所有 HTML 檢視都用惰性的 `DOMParser`,不用 `div.innerHTML`(後者即使未掛載也會載入圖片) |
| 匯出內嵌的圖片 | 資料 URI 的 MIME 型別來自檔頭辨識的白名單,不是使用者文字 |

## 打包版的本機伺服器
`MarkFlowStudio.exe` 在 `127.0.0.1` 啟動一個只服務打包內容的伺服器:只綁回送位址;檢查 `Host` 標頭(防 DNS rebinding);只提供清單中的檔案(以完整鍵值查找,沒有檔案系統路徑處理);只允許 GET／HEAD 與同源的 `bye` 信標;帶 CSP、`nosniff`、`no-referrer` 等標頭。`launcher.test.ts` 以真實 HTTP 連線逐項測試。細節見 [PACKAGING.md](./PACKAGING.md)。執行檔**沒有數位簽章**。

## 檔案安全
- 匯出前以 `isSameEntry` 檢查,**拒絕寫入來源文件**;匯入結果開成新的未儲存文件。
- 寫入使用 `createWritable`(寫入暫存、`close()` 才提交);失敗時 `abort()`,原檔不變。寫完檢查輸出檔非空。
- 自動儲存僅寫回已開啟／儲存過的檔案,不建立新檔、不彈窗。

## iframe
- 匯出預覽 iframe:`sandbox=""`(無腳本、無同源)。
- 列印用 iframe(`platform/browserPrint.ts`)為**同源**(呼叫 `print()` 需要),因此不使用 sandbox。防線是:內容經過 DOMPurify;文件自帶 `default-src 'none'` CSP;srcdoc 同時繼承 app 的 CSP。若消毒被繞過,這兩層 CSP 仍會阻擋腳本執行,但這是縱深防禦而非獨立證明。

## 依賴
| 套件 | 版本 | 授權 |
|---|---|---|
| react / react-dom | 19.3.1 | MIT |
| codemirror 與 `@codemirror/*` | 6.x | MIT |
| markdown-it | 15.0.2 | MIT |
| dompurify | 3.4.17 | MPL-2.0 或 Apache-2.0 |
| docx | 9.11.0 | MIT |
| jszip | 3.10.2 | MIT 或 GPL-3.0(採 MIT) |
| turndown | 7.2.4 | MIT |
| mammoth | 1.13.0 | BSD-2-Clause |
| axe-core(僅開發) | 4.14.0 | MPL-2.0 |
| fake-indexeddb(僅開發) | 6.2.5 | Apache-2.0 |
| postject、rcedit(僅打包) | 1.0.0-alpha.6、5.0.2 | MIT |

### `npm audit` 現況(誠實揭露)
3 個**中等**等級警告,全部來自 `mammoth → argparse → sprintf-js`(`GHSA-hp3w-g68c-fv3c`,格式化字串精度造成的阻斷服務)。
- 官方建議的修法是降級到 mammoth 0.3.29(重大變更),**我沒有這麼做**。
- 評估:`argparse` 只被 mammoth 的命令列工具(`bin/mammoth`)使用,函式庫程式碼不引用;正式建置的 bundle 中沒有 `ArgumentParser`。因此在本 app 中**看起來不會被觸發**,但弱點仍存在於依賴樹,尚未解決。後續應追蹤 mammoth 更新。

## 尚未做 / 限制
- 沒有第三方滲透測試或程式碼稽核。
- Tauri 桌面版沒有授予網頁任何原生權限(`capabilities/default.json` 的 `permissions` 為空,Rust 端沒有註冊任何指令),檔案存取走與網頁版相同的瀏覽器 File System Access API。安裝程式與執行檔未簽章。
- `style-src 'unsafe-inline'` 無法移除而不重寫主題套用機制。
- 無法保證 DOCX 匯入的炸彈防護(見上)。
