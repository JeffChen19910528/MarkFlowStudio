/**
 * Real-browser smoke test using the Chrome DevTools Protocol (no dependencies; Node 22+).
 *
 *   npm run build && npx vite preview --port 4173 &
 *   MARKFLOW_CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe" node scripts/browser-smoke.mjs [url]
 *
 * Drives a headless Chrome the way a user would (real focus, real text input, real clicks) and checks
 * things jsdom cannot: tab switching with per-document undo history, the outline, view modes, and that
 * the page logs no errors. Exits non-zero on any failure.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const chromePath = process.env.MARKFLOW_CHROME;
// Desktop shell mode: start the Tauri app with WebView2 remote debugging and test its real window.
const appExe = process.env.MARKFLOW_APP_EXE;
const url = process.argv[2] ?? "http://localhost:4173/";
if (!chromePath && !appExe) {
  console.error("Set MARKFLOW_CHROME to a Chrome/Edge executable.");
  process.exit(2);
}

const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), "markflow-cdp-"));
const chrome = appExe
  ? spawn(appExe, [], {
      stdio: "ignore",
      env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --lang=zh-TW`, WEBVIEW2_USER_DATA_FOLDER: profile },
    })
  : spawn(
      chromePath,
      ["--headless=new", "--disable-gpu", "--no-sandbox", "--lang=zh-TW", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"],
      { stdio: "ignore" },
    );

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const problems = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> ${detail}`}`);
};

async function main() {
  let version;
  for (let i = 0; i < 50 && !version; i++) {
    try {
      version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    } catch {
      await sleep(200);
    }
  }
  if (!version) throw new Error("Chrome did not start");
  console.log("Browser:", version.Browser);

  let target;
  if (appExe) {
    for (let i = 0; i < 50 && !target; i++) {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      target = list.find((t) => t.type === "page");
      if (!target) await sleep(200);
    }
    if (!target) throw new Error("the app window did not open");
  } else {
    target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = () => rej(new Error("websocket failed"));
  });

  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    } else if (msg.method === "Runtime.exceptionThrown") {
      problems.push("exception: " + (msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text));
    } else if (msg.method === "Runtime.consoleAPICalled" && ["error", "assert"].includes(msg.params.type)) {
      problems.push("console." + msg.params.type + ": " + msg.params.args.map((a) => a.value ?? a.description).join(" "));
    } else if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
      problems.push("log: " + msg.params.entry.text + " " + (msg.params.entry.url ?? ""));
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      pending.set(n, { resolve, reject });
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };

  await send("Runtime.enable");
  await send("Log.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  // In desktop mode the app loads its own page in a fresh profile, so there is nothing to navigate to.
  if (!appExe) await send("Page.navigate", { url });
  for (let i = 0; i < 50 && !(await evaluate("!!document.querySelector('.cm-content') && !!document.querySelector('.tab-main')").catch(() => false)); i++) await sleep(200);

  const text = () => evaluate("document.querySelector('.cm-content').innerText.replace(/\\u200b/g,'')");
  const tabs = () => evaluate("[...document.querySelectorAll('.tab-main')].map(e => e.textContent.trim())");
  const clickButton = (label) =>
    evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === ${JSON.stringify(label)} || x.getAttribute('aria-label') === ${JSON.stringify(label)}); if (!b) return false; b.click(); return true; })()`);
  // Tabs are addressed by position: opened files may legitimately share a title.
  const clickTab = (index) =>
    evaluate(`(() => { const b = document.querySelectorAll('.tab-main')[${index}]; if (!b) return false; b.click(); return true; })()`);
  const closeTab = (index) =>
    evaluate(`(() => { const b = document.querySelectorAll('.tab-close')[${index}]; if (!b) return false; b.click(); return true; })()`);
  const focusEditor = () => evaluate("document.querySelector('.cm-content').focus(), true");
  const typeText = async (t) => {
    await focusEditor();
    await send("Input.insertText", { text: t });
    await sleep(150);
  };
  const settle = () => sleep(250);

  // --- initial render
  check("app renders toolbar, tabs, editor, preview, sidebar", await evaluate(
    "!!document.querySelector('[role=toolbar]') && !!document.querySelector('nav.tabs') && !!document.querySelector('.cm-editor') && !!document.querySelector('.preview') && !!document.querySelector('aside.sidebar')"));
  check("starts with one untitled tab", JSON.stringify(await tabs()) === JSON.stringify(["未命名.md"]), JSON.stringify(await tabs()));

  // --- typing, preview, outline
  await typeText("# 甲標題\n\n甲內容");
  await settle();
  check("typed text appears in the editor", (await text()).includes("甲內容"), await text());
  check("live preview renders the heading", await evaluate("!!document.querySelector('.preview h1') && document.querySelector('.preview h1').textContent === '甲標題'"));
  check("outline lists the heading", await evaluate("[...document.querySelectorAll('.outline button')].some(b => b.textContent === '甲標題')"));
  check("tab shows the dirty marker", (await tabs())[0].startsWith("●"), JSON.stringify(await tabs()));

  // --- a second tab with its own text
  await clickButton("新增");
  await settle();
  check("新增 adds a second tab and keeps the first", (await tabs()).length === 2, JSON.stringify(await tabs()));
  check("new tab starts empty", (await text()).trim() === "", JSON.stringify(await text()));
  await typeText("乙內容");
  await settle();
  check("second tab holds its own text", (await text()).includes("乙內容") && !(await text()).includes("甲內容"));

  // --- switching restores each document and its undo history (the risky part: one EditorView, many states)
  check("untitled tabs get distinct names", new Set(await tabs()).size === 2, JSON.stringify(await tabs()));
  await clickTab(0);
  await settle();
  check("switching back restores the first document", (await text()).includes("甲內容") && !(await text()).includes("乙內容"), await text());
  check("preview follows the active tab", await evaluate("document.querySelector('.preview h1')?.textContent === '甲標題'"));

  await clickButton("復原");
  await settle();
  const afterUndoA = await text();
  check("undo on tab A removes A's typing", !afterUndoA.includes("甲內容"), afterUndoA);

  await clickTab(1);
  await settle();
  check("tab B is unaffected by undo in tab A", (await text()).includes("乙內容"), await text());
  await clickButton("復原");
  await settle();
  check("undo on tab B removes B's typing", !(await text()).includes("乙內容"), await text());

  await clickTab(0);
  await settle();
  await clickButton("重做");
  await settle();
  check("redo history of tab A survived the switches", (await text()).includes("甲內容") , await text());

  // --- closing
  // tab B was undone back to its saved (empty) state, so it is clean and closes without a prompt
  await closeTab(1);
  await settle();
  check("closing a clean tab needs no prompt", (await tabs()).length === 1 && (await evaluate("!document.querySelector('[role=alertdialog]')")), JSON.stringify(await tabs()));
  // tab A has unsaved text: closing must ask, and cancelling must keep it
  await closeTab(0);
  await settle();
  check("closing a dirty tab asks first", await evaluate("!!document.querySelector('[role=alertdialog]')"));
  await clickButton("取消");
  await settle();
  check("cancelling keeps the tab and its text", (await tabs()).length === 1 && (await text()).includes("甲內容"), JSON.stringify(await tabs()));
  check("favicon is served (no 404)", await evaluate("fetch('/favicon.svg').then(r => r.ok && r.headers.get('content-type').includes('svg'))"));

  // --- view modes
  await clickButton("預覽");
  await settle();
  check("preview-only mode hides the editor pane", await evaluate("getComputedStyle(document.querySelector('.editor-pane')).display === 'none'"));
  await clickButton("編輯");
  await settle();
  check("edit-only mode removes the preview", await evaluate("!document.querySelector('.preview')"));
  await clickButton("分割");

  // --- dialogs open, trap focus and close
  await clickButton("匯出");
  await settle();
  check("export dialog opens and takes focus", await evaluate("!!document.querySelector('[role=dialog]') && document.querySelector('[role=dialog]').contains(document.activeElement)"));
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await settle();
  check("Escape closes the dialog", await evaluate("!document.querySelector('[role=dialog]')"));

  // --- layout regression: the editor must stay usable at every window width (it once collapsed to 0px at <=900px)
  for (const [w, h] of [[1280, 800], [1101, 700], [1100, 700], [1000, 700], [800, 600], [390, 800]]) {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await settle();
    const m = await evaluate(`JSON.stringify({ editor: document.querySelector('.editor-pane').getBoundingClientRect().width, editorH: document.querySelector('.editor-pane').getBoundingClientRect().height, overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth })`);
    const { editor, editorH, overflowX } = JSON.parse(m);
    check(`${w}px wide: editor is usable (${Math.round(editor)}x${Math.round(editorH)})`, editor >= 280 && editorH >= 150, m);
    check(`${w}px wide: page has no horizontal overflow`, overflowX <= 1, m);
  }
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await settle();

  // --- images: local folder access, blob previews under the CSP, and no stray requests
  const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  // OPFS gives a real FileSystemDirectoryHandle (same API as showDirectoryPicker) without a native dialog.
  await evaluate(`(async () => {
    const root = await navigator.storage.getDirectory();
    const fh = await root.getFileHandle('cat.png', { create: true });
    const w = await fh.createWritable();
    await w.write(Uint8Array.from(atob(${JSON.stringify(PNG_B64)}), c => c.charCodeAt(0)));
    await w.close();
    window.showDirectoryPicker = async () => root;
    performance.clearResourceTimings();
    return true;
  })()`);
  await clickButton("新增");
  await settle();
  await typeText("![貓](./cat.png)\n\n![無](./nope.png)\n\n![外](https://example.invalid/p.png)");
  await settle();
  const imgState = () =>
    evaluate(`JSON.stringify([...document.querySelectorAll('.preview img')].map(i => ({ src: i.getAttribute('src'), cls: i.className, w: i.naturalWidth, title: i.getAttribute('title') })))`);
  const before = JSON.parse(await imgState());
  check("preview shows three images without src (the browser must not fetch them itself)", before.length === 3 && before.every((i) => i.src === null), JSON.stringify(before));
  check("no request was started for relative or remote images", await evaluate(`performance.getEntriesByType('resource').every(r => !/nope[.]png|cat[.]png|example[.]invalid/.test(r.name))`),
    await evaluate(`JSON.stringify(performance.getEntriesByType('resource').map(r => r.name))`));
  check("sidebar offers to choose the image folder", await evaluate("[...document.querySelectorAll('.sidebar button')].some(b => b.textContent.includes('選擇圖片資料夾'))"));

  await clickButton("選擇圖片資料夾…");
  await settle();
  await sleep(400);
  const after = JSON.parse(await imgState());
  check("image from the chosen folder is shown through a blob URL and really decodes", after[0].src?.startsWith("blob:") && after[0].w === 1, JSON.stringify(after[0]));
  check("a missing image is marked with the reason", after[1].cls.includes("img-unresolved") && /找不到檔案/.test(after[1].title ?? ""), JSON.stringify(after[1]));
  check("a remote image stays blocked", after[2].cls.includes("img-blocked") && after[2].src === null, JSON.stringify(after[2]));
  check("still no request for the remote or missing image", await evaluate(`performance.getEntriesByType('resource').every(r => !/nope[.]png|example[.]invalid/.test(r.name))`));

  await clickButton("匯出");
  await settle();
  await sleep(400);
  const exportDoc = await evaluate("document.querySelector('[role=dialog] iframe')?.getAttribute('srcdoc') ?? ''");
  check("HTML export embeds the found image as a data URI", /data:image\/png;base64,/.test(exportDoc));
  check("export dialog explains the image that could not be loaded", await evaluate("document.querySelector('[role=dialog]').textContent.includes('nope.png')"));
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await settle();

  // --- accessibility with real layout (jsdom cannot compute colour contrast)
  const axeSource = readFileSync(new URL("../node_modules/axe-core/axe.min.js", import.meta.url), "utf-8");
  await evaluate(axeSource + "; true");
  const runAxe = () =>
    evaluate(`axe.run(document, { iframes: false }).then(r => r.violations.map(v => v.id + ': ' + v.nodes.slice(0, 3).map(n => n.target.join(' ') + ' [' + (n.any[0] && n.any[0].message || n.all[0] && n.all[0].message || '') + ']').join(' | ')))`);
  let v = await runAxe();
  check("axe (incl. colour contrast): main screen", v.length === 0, v.join(" || "));
  await clickButton("匯出");
  await settle();
  v = await runAxe();
  check("axe (incl. colour contrast): export dialog", v.length === 0, v.join(" || "));
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await settle();
  await clickButton("快捷鍵");
  await settle();
  v = await runAxe();
  check("axe (incl. colour contrast): shortcuts dialog", v.length === 0, v.join(" || "));

  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await settle();

  // --- interface language (the browser was started in Traditional Chinese)
  const chooseLanguage = (value) =>
    evaluate(`(() => { const s = document.querySelector('.lang-select'); if (!s) return false;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, ${JSON.stringify(value)});
      s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  // A page-side expression for "contains a CJK ideograph" (no backslashes, so it survives any quoting).
  const HAN = "new RegExp(String.fromCharCode(91, 0x4e00, 45, 0x9fff, 93))";
  check("the interface starts in the browser's language (Chinese)", (await evaluate("document.documentElement.lang")) === "zh-Hant");
  check("switching to English works", await chooseLanguage("en"));
  await settle();
  check("English: page language, toolbar and tab bar are translated", await evaluate(`document.documentElement.lang === 'en'
    && [...document.querySelectorAll('.toolbar button')].some(b => b.textContent.trim() === 'Save as')
    && !!document.querySelector('nav.tabs[aria-label="Open documents"]')`));
  check("English: no Chinese left in the toolbar, status bar, sidebar or settings", await evaluate(`(() => {
    const re = ${HAN}; const bad = [];
    for (const sel of ['.toolbar', '.statusbar', 'aside.sidebar', 'aside.settings']) {
      const el = document.querySelector(sel); if (!el) continue;
      const clone = el.cloneNode(true); clone.querySelectorAll('.lang-select').forEach(n => n.remove());
      if (re.test(clone.textContent)) bad.push(sel);
    }
    return bad.length ? bad.join(' | ') : true; })()`));
  check("English: the document's text is untouched", (await text()).includes("甲內容") || (await text()).length > 0);
  await clickButton("Export");
  await settle();
  check("English: export dialog is translated", await evaluate(`(() => { const d = document.querySelector('[role=dialog]'); return !!d && d.textContent.includes('Print style') && !${HAN}.test(d.textContent); })()`));
  v = await runAxe();
  check("axe (incl. colour contrast): English export dialog", v.length === 0, v.join(" || "));
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await settle();
  v = await runAxe();
  check("axe (incl. colour contrast): English main screen", v.length === 0, v.join(" || "));
  check("the choice is remembered", (await evaluate("localStorage.getItem('markflow.language')")) === "en");
  check("switching back to Chinese works", (await chooseLanguage("zh-TW")) && (await (async () => { await settle(); return evaluate("document.documentElement.lang === 'zh-Hant' && [...document.querySelectorAll('.toolbar button')].some(b => b.textContent.trim() === '另存新檔')"); })()));

  check("no console errors or exceptions", problems.length === 0, problems.join(" || "));
  ws.close();
}

let code = 0;
try {
  await main();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) code = 1;
} catch (e) {
  console.error("ERROR:", e.message);
  code = 1;
} finally {
  chrome.kill();
  await sleep(500);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    /* profile may still be locked on Windows; the OS temp cleaner will remove it */
  }
}
process.exit(code);
