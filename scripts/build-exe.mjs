/**
 * Builds release/MarkFlowStudio.exe — a single file that needs nothing installed.
 *
 *   npm run package            build the web app, then the executable and a zip
 *   npm run package -- --skip-build     reuse the existing dist/
 *   npm run package -- --console        keep a console window (for debugging the launcher)
 *
 * How: Node's "single executable application" feature. The program is a copy of node.exe with the
 * launcher script and the whole built web app (dist/) embedded as assets, then given our icon and
 * version information, and switched to the Windows GUI subsystem so no black console window appears.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { rcedit } from "rcedit";
import { checkPe } from "./pe-check.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const isWin = process.platform === "win32";
const exeName = isWin ? "MarkFlowStudio.exe" : "MarkFlowStudio";
const build = join(root, "build");
const release = join(root, "release");
const dist = join(root, "dist");
const step = (msg) => console.log(`\n▶ ${msg}`);

function run(cmd, cmdArgs, opts = {}) {
  execFileSync(cmd, cmdArgs, { stdio: "inherit", cwd: root, ...opts });
}

function walk(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    return e.isDirectory() ? walk(full, base) : [relative(base, full).split(sep).join("/")];
  });
}

// 1. web app
if (!args.has("--skip-build")) {
  step("Building the web app (npm run build)");
  run(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], { shell: process.platform === "win32" });
}
if (!existsSync(join(dist, "index.html"))) throw new Error("dist/index.html not found; run the build first.");

rmSync(build, { recursive: true, force: true });
mkdirSync(build, { recursive: true });
mkdirSync(release, { recursive: true });

// 2. launcher bundle: SEA can only require() built-ins, so inline the core module into one script
step("Bundling the launcher");
const core = readFileSync(join(root, "scripts", "launcher-core.cjs"), "utf8");
const launcher = readFileSync(join(root, "scripts", "launcher.cjs"), "utf8");
const MARK = '/*INLINE_CORE*/ const { startServer } = require("./launcher-core.cjs");';
if (!launcher.includes(MARK)) throw new Error("launcher.cjs is missing the INLINE_CORE marker");
const inlined = `const { startServer } = (function () {\n  const module = { exports: {} };\n  const exports = module.exports;\n${core}\n  return module.exports;\n})();`;
const bundlePath = join(build, "launcher.bundle.cjs");
writeFileSync(bundlePath, launcher.replace(MARK, inlined));

// 3. assets: every file of dist/, plus a manifest the server uses as its allow-list
step("Collecting assets");
const files = walk(dist);
const manifestPath = join(build, "__manifest.json");
writeFileSync(manifestPath, JSON.stringify(files));
const assets = { "__manifest.json": manifestPath };
for (const f of files) assets[f] = join(dist, ...f.split("/"));
console.log(`  ${files.length} files, ${(files.reduce((s, f) => s + statSync(join(dist, ...f.split("/"))).size, 0) / 1024 / 1024).toFixed(1)} MB`);

// 4. SEA blob
step("Preparing the single-executable blob");
const blobPath = join(build, "sea-prep.blob");
const seaConfig = join(build, "sea-config.json");
writeFileSync(seaConfig, JSON.stringify({ main: bundlePath, output: blobPath, disableExperimentalSEAWarning: true, useCodeCache: false, assets }, null, 2));
run(process.execPath, ["--experimental-sea-config", seaConfig]);

// 5. copy the Node runtime
step(`Copying the Node.js runtime (${process.version})`);
const exePath = join(release, exeName);
rmSync(exePath, { force: true });
copyFileSync(process.execPath, exePath);

// 6. icon + version info (Windows). rcedit uses the operating system's own resource API, which keeps the
// executable's structure intact (an earlier attempt with a pure-JS PE rewriter destroyed the relocation table).
if (isWin && !args.has("--no-icon")) {
  step("Setting icon and version information");
  const [major = 0, minor = 0, patch = 0] = String(pkg.version).split(".").map((n) => Number.parseInt(n, 10) || 0);
  const four = `${major}.${minor}.${patch}.0`;
  const options = {
    "file-version": four,
    "product-version": four,
    "version-string": {
      FileDescription: "MarkFlow Studio - Markdown editor and converter",
      ProductName: "MarkFlow Studio",
      InternalName: "MarkFlowStudio",
      OriginalFilename: "MarkFlowStudio.exe",
      CompanyName: "MarkFlow Studio",
      LegalCopyright: "MIT License. Includes Node.js (MIT) and the packages listed in THIRD-PARTY-NOTICES.txt",
      Comments: "Runs locally; documents never leave your computer.",
    },
  };
  const icoPath = join(root, "assets", "icon.ico");
  if (existsSync(icoPath)) options.icon = icoPath;
  else console.log("  assets/icon.ico not found; keeping the default icon");
  await rcedit(exePath, options);
}

// 7. inject the blob
step("Injecting the application into the executable");
run(process.execPath, [
  join(root, "node_modules", "postject", "dist", "cli.js"),
  exePath,
  "NODE_SEA_BLOB",
  blobPath,
  "--sentinel-fuse",
  "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
]);

// 8. no console window
if (isWin && !args.has("--console")) {
  step("Switching to the Windows GUI subsystem (no console window)");
  const buf = readFileSync(exePath);
  const peOffset = buf.readUInt32LE(0x3c);
  if (buf.toString("latin1", peOffset, peOffset + 4) !== "PE\0\0") throw new Error("not a PE file");
  const subsystemOffset = peOffset + 24 + 68;
  const before = buf.readUInt16LE(subsystemOffset);
  buf.writeUInt16LE(2, subsystemOffset); // IMAGE_SUBSYSTEM_WINDOWS_GUI
  buf.writeUInt32LE(0, peOffset + 24 + 64); // checksum is not validated for user-mode programs
  writeFileSync(exePath, buf);
  console.log(`  subsystem ${before} -> 2`);
}

// 8b. refuse to ship a damaged executable
if (isWin) {
  step("Checking the executable's structure against the original node.exe");
  const result = checkPe(readFileSync(exePath), readFileSync(process.execPath));
  if (!result.ok) throw new Error(["The executable is damaged:", ...result.problems.map((p) => "  - " + p)].join(String.fromCharCode(10)));
  console.log(`  OK: ${result.reloc.blocks} relocation blocks / ${result.reloc.entries} entries, identical to node.exe; subsystem ${result.subsystem}`);
}

// 9. notices and instructions
step("Writing notices and instructions");
writeFileSync(join(release, "使用說明.txt"), instructions(), "utf8");
writeFileSync(join(release, "THIRD-PARTY-NOTICES.txt"), notices(), "utf8");

// 10. zip
step("Creating the zip");
const zipName = `MarkFlowStudio-${isWin ? "Windows" : process.platform}-${process.arch}-v${pkg.version}.zip`;
const zip = new JSZip();
const folder = zip.folder("MarkFlowStudio");
folder.file(exeName, readFileSync(exePath), { unixPermissions: 0o755 });
folder.file("使用說明.txt", readFileSync(join(release, "使用說明.txt")));
folder.file("THIRD-PARTY-NOTICES.txt", readFileSync(join(release, "THIRD-PARTY-NOTICES.txt")));
writeFileSync(join(release, zipName), await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 }, platform: "UNIX" }));

const mb = (p) => (statSync(p).size / 1024 / 1024).toFixed(1);
console.log(`\n✔ ${join("release", exeName)}  ${mb(exePath)} MB\n✔ ${join("release", zipName)}  ${mb(join(release, zipName))} MB`);

function instructions() {
  return `MarkFlow Studio ${pkg.version} 使用說明 / Instructions (English below)
========================================

【怎麼開始】
  雙擊「MarkFlowStudio.exe」。
  幾秒鐘後會出現 MarkFlow Studio 的視窗。不需要安裝、不需要網路、不需要任何其他軟體。

【怎麼結束】
  直接關閉視窗即可。背景的小程式會在幾秒鐘內自動結束。

【需要什麼】
  Windows 10 或 11,並且有 Microsoft Edge(Windows 內建)或 Google Chrome。

【重要:您的文件很安全】
  - 所有處理都在您自己的電腦上進行,文件不會上傳到任何地方。
  - 程式只會讀寫您在「開啟」「儲存」對話框中明確選擇的檔案。
  - 請記得儲存!關閉視窗前若有未儲存的內容,程式會提醒您。

【第一次執行時 Windows 可能會警告】
  畫面:「Windows 已保護您的電腦」(SmartScreen)
  原因:這個程式沒有購買商業數位簽章,Windows 對所有這類程式都會顯示警告,不代表有問題。
  做法:點「其他資訊」,再點「仍要執行」。(請確認這個檔案來自您信任的人。)
  部分防毒軟體也可能詢問,請選擇允許。

【常見問題】
  Q: 雙擊後沒有任何視窗?
  A: 請等 5–10 秒。若仍沒有,看看有沒有跳出錯誤訊息。也可以打開瀏覽器,輸入  http://127.0.0.1:47831  。
  Q: 我的設定和「最近文件」不見了?
  A: 設定與最近文件存在瀏覽器裡。請一律用這個程式開啟(不要換成用別的瀏覽器開網址),才會看到同樣的設定。
  Q: 可以同時開很多份文件嗎?
  A: 可以,畫面上方有分頁,也可以再雙擊一次程式開第二個視窗。
  Q: 怎麼匯出成 PDF?
  A: 按「匯出」→ 選 PDF →「開啟列印對話框」,在目的地選「另存為 PDF」。
  Q: 圖片沒有顯示?
  A: 文件裡用相對路徑的圖片,需要在左側「圖片資料夾」選擇圖片所在的資料夾(程式只會讀取,不會修改)。
  Q: 出問題了,怎麼回報?
  A: 記錄檔在  %LOCALAPPDATA%\\MarkFlowStudio\\launcher.log  (在檔案總管網址列貼上即可),回報時請附上。

【解除安裝】
  直接刪除這個資料夾即可。程式沒有安裝任何東西到系統。
  (瀏覽器內的設定可在 Edge「設定 → Cookie 與網站權限」中清除。)

【授權】
  本程式以 MIT 授權發佈,內含的第三方軟體與授權請見 THIRD-PARTY-NOTICES.txt。

【介面語言】
  工具列最右邊的選單可在「繁體中文」與「English」之間切換,選擇會被記住。

========================================
MarkFlow Studio ${pkg.version} Instructions
========================================

[Getting started]
  Double-click "MarkFlowStudio.exe". After a few seconds the MarkFlow Studio window opens.
  Nothing to install, no internet needed, no other software required.

[Quitting]
  Just close the window. The small background program exits by itself within a few seconds.

[Requirements]
  Windows 10 or 11 with Microsoft Edge (built into Windows) or Google Chrome.

[Important: your documents are safe]
  - Everything happens on your own computer; nothing is uploaded anywhere.
  - The program only reads and writes the files you explicitly choose in the Open / Save dialogs.
  - Remember to save! The program warns you about unsaved content when you close a tab.

[Windows may warn you the first time]
  Screen: "Windows protected your PC" (SmartScreen)
  Why: the program is not signed with a commercial certificate; Windows warns about every such program. It does not mean anything is wrong.
  What to do: click "More info", then "Run anyway". (Make sure you got the file from someone you trust.)
  Some antivirus programs may ask too; choose to allow it.

[FAQ]
  Q: Nothing opens after I double-click?
  A: Wait 5-10 seconds. If still nothing, look for an error message. You can also open a browser and go to http://127.0.0.1:47831
  Q: My settings and recent files are gone?
  A: They are stored in the browser profile used by this program. Always start it from this program (do not open the address in another browser).
  Q: Can I open several documents?
  A: Yes. There are tabs at the top, and you can double-click the program again for a second window.
  Q: How do I export a PDF?
  A: Export > choose PDF > "Open print dialog", then pick "Save as PDF" as the destination.
  Q: My images do not show up?
  A: Images with relative paths need the "Image folder" in the left sidebar to be set to the folder that contains them (read only, never modified).
  Q: Something went wrong. How do I report it?
  A: The log file is launcher.log in the MarkFlowStudio folder inside %LOCALAPPDATA% (paste %LOCALAPPDATA% into the File Explorer address bar). Please attach it.

[Language]
  The menu at the right end of the toolbar switches between Traditional Chinese and English. Your choice is remembered.

[Uninstalling]
  Just delete this folder. Nothing was installed on your system.

[License]
  MIT. Third-party software and licenses are listed in THIRD-PARTY-NOTICES.txt.
`;
}

function notices() {
  // Every package that ends up in the shipped program: production dependencies and what they pull in.
  const tree = JSON.parse(
    execFileSync(isWin ? "npm.cmd" : "npm", ["ls", "--omit=dev", "--all", "--long", "--json"], { cwd: root, shell: isWin, maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }).toString(),
  );
  const seen = new Map();
  const visit = (deps) => {
    for (const [name, info] of Object.entries(deps ?? {})) {
      const key = `${name}@${info.version}`;
      if (!seen.has(key) && info.path) seen.set(key, { name, version: info.version, path: info.path, license: info.license ?? info._license, homepage: info.homepage });
      visit(info.dependencies);
    }
  };
  visit(tree.dependencies);
  const parts = [
    "MarkFlow Studio — 第三方軟體聲明 / Third-party notices",
    "=".repeat(60),
    "",
    `This program embeds the Node.js runtime ${process.version} (MIT License, https://github.com/nodejs/node/blob/main/LICENSE)`,
    "and the following open-source packages.",
    "",
  ];
  for (const { name, version, path, license, homepage } of [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    parts.push("-".repeat(60), `${name} ${version}`, `License: ${typeof license === "string" ? license : JSON.stringify(license ?? "see package")}`);
    if (homepage) parts.push(homepage);
    const licenseFile = existsSync(path) ? readdirSync(path).find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f)) : undefined;
    if (licenseFile) parts.push("", readFileSync(join(path, licenseFile), "utf8").trim());
    parts.push("");
  }
  return parts.join("\n");
}
