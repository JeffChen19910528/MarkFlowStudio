"use strict";
/**
 * MarkFlow Studio launcher: the program inside MarkFlowStudio.exe.
 *
 * Double-click → starts a local-only web server for the bundled app and opens it in an app-style window
 * of Edge or Chrome (no address bar). When the last window closes the server exits by itself.
 * Running it again while it is already running just opens another window.
 *
 * It has no console window, so anything the user needs to know is shown in a message box, and details
 * are written to a log file.
 *
 * Environment overrides (mainly for testing and power users):
 *   MARKFLOW_NO_BROWSER=1       do not open a window
 *   MARKFLOW_BROWSER=<path>     browser executable to use
 *   MARKFLOW_BROWSER_ARGS=...   extra browser arguments (space separated)
 *   MARKFLOW_PORTS=47831,47832  ports to try, in order
 *   MARKFLOW_IDLE_MS / MARKFLOW_BYE_GRACE_MS / MARKFLOW_STARTUP_MS   lifetime tuning
 *   MARKFLOW_DIST=<dir>         serve this folder instead of the embedded app (development)
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
/*INLINE_CORE*/ const { startServer } = require("./launcher-core.cjs");

const IS_WIN = process.platform === "win32";
const IS_MAC = process.platform === "darwin";
const TITLE = "MarkFlow Studio";

let sea = null;
try {
  sea = require("node:sea");
} catch {
  sea = null;
}
const isSea = Boolean(sea && sea.isSea && sea.isSea());

// ---------- logging ----------
function logPath() {
  const base = IS_WIN ? process.env.LOCALAPPDATA || os.homedir() : IS_MAC ? path.join(os.homedir(), "Library", "Logs") : path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state"));
  return path.join(base, "MarkFlowStudio", "launcher.log");
}

function log(message) {
  try {
    const file = logPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try {
      if (fs.statSync(file).size > 200 * 1024) fs.truncateSync(file, 0);
    } catch {
      /* no log yet */
    }
    fs.appendFileSync(file, `${new Date().toISOString()} ${message}\n`);
  } catch {
    /* logging must never break the app */
  }
}

function say(text) {
  try {
    process.stdout.write(text + "\n");
  } catch {
    /* no console (GUI subsystem) */
  }
}

/** Messages for the user follow the system language: Chinese for zh locales, English otherwise. */
const ZH = /^zh/i.test(Intl.DateTimeFormat().resolvedOptions().locale);
const L = (zh, en) => (ZH ? zh : en);

/** Tell the user something went wrong, in a way a non-programmer will see. */
function showError(message) {
  log("ERROR " + message);
  say(L("錯誤:", "Error: ") + message);
  try {
    if (IS_WIN) {
      const script = "Add-Type -AssemblyName PresentationFramework; [void][System.Windows.MessageBox]::Show($env:MF_MSG, $env:MF_TITLE, 'OK', 'Error')";
      spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
        env: { ...process.env, MF_MSG: message, MF_TITLE: TITLE },
      }).unref();
    } else if (IS_MAC) {
      spawn("osascript", ["-e", `display dialog ${JSON.stringify(message)} with title ${JSON.stringify(TITLE)} buttons {"OK"} with icon stop`], { detached: true, stdio: "ignore" }).unref();
    }
  } catch {
    /* already logged */
  }
}

// ---------- assets ----------
function walk(root, rel = "") {
  const out = [];
  for (const entry of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const next = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(root, next));
    else out.push(next);
  }
  return out;
}

function loadAssets() {
  if (isSea) {
    const manifest = JSON.parse(Buffer.from(sea.getRawAsset("__manifest.json")).toString("utf8"));
    return { manifest, read: (key) => Buffer.from(sea.getRawAsset(key)) };
  }
  const root = process.env.MARKFLOW_DIST || path.join(__dirname, "..", "dist");
  if (!fs.existsSync(path.join(root, "index.html"))) {
    throw new Error(L(`找不到 ${path.join(root, "index.html")}。請先執行 npm run build。`, `${path.join(root, "index.html")} not found. Run npm run build first.`));
  }
  return { manifest: walk(root), read: (key) => fs.readFileSync(path.join(root, key)) };
}

// ---------- opening a window ----------
function browserCandidates() {
  if (process.env.MARKFLOW_BROWSER) return [process.env.MARKFLOW_BROWSER];
  if (IS_WIN) {
    const pf = process.env.ProgramFiles || "C:\\Program Files";
    const pf86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    const local = process.env.LOCALAPPDATA || "";
    // Edge first: it ships with Windows 10/11, so the same browser (and therefore the same saved settings) is used everywhere.
    return [
      path.join(pf86, "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(pf, "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(pf, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(pf86, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(local, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(pf, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
    ].filter((p) => p && fs.existsSync(p));
  }
  if (IS_MAC) {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    ].filter((p) => fs.existsSync(p));
  }
  return ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge"];
}

function trySpawn(command, args, options = {}) {
  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, { detached: true, stdio: "ignore", ...options });
      child.once("error", () => resolve(false));
      child.once("spawn", () => {
        child.unref();
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}

async function openWindow(url) {
  const extra = (process.env.MARKFLOW_BROWSER_ARGS || "").split(/\s+/).filter(Boolean);
  for (const exe of browserCandidates()) {
    log(`opening ${url} with ${exe}`);
    if (await trySpawn(exe, [`--app=${url}`, "--window-size=1280,860", ...extra])) return true;
  }
  // No Chromium-based browser found: fall back to whatever the system uses for web pages.
  log("no Chromium browser found; using the default browser");
  if (IS_WIN) return trySpawn("cmd.exe", ["/c", "start", "", url], { windowsHide: true });
  return trySpawn(IS_MAC ? "open" : "xdg-open", [url]);
}

// ---------- main ----------
function numberFromEnv(name) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

async function main() {
  const assets = loadAssets();
  const ports = (process.env.MARKFLOW_PORTS || "47831,47832,47833,47834,47835,47836,47837,47838,47839,47840")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n < 65536);

  const config = {};
  for (const [key, env] of [["idleMs", "MARKFLOW_IDLE_MS"], ["byeGraceMs", "MARKFLOW_BYE_GRACE_MS"], ["startupMs", "MARKFLOW_STARTUP_MS"]]) {
    const v = numberFromEnv(env);
    if (v !== undefined) config[key] = v;
  }

  const result = await startServer({
    manifest: assets.manifest,
    readAsset: assets.read,
    ports,
    config,
    onIdle: () => {
      log("all windows closed; exiting");
      process.exit(0);
    },
  });

  const port = result.reused ?? result.port;
  const url = `http://127.0.0.1:${port}/`;
  log(result.reused ? `already running on ${port}; opening another window` : `serving on ${url}`);
  say(url);

  if (process.env.MARKFLOW_NO_BROWSER !== "1") {
    const opened = await openWindow(url);
    if (!opened) {
      showError(L("無法自動開啟視窗。請手動用瀏覽器(建議 Edge 或 Chrome)開啟這個網址:", "Could not open a window automatically. Open this address in a browser (Edge or Chrome recommended):") + "\n" + url);
    }
  }
  if (result.reused) process.exit(0);
}

process.on("uncaughtException", (e) => {
  showError(L("程式發生未預期的錯誤:", "Unexpected error: ") + (e && e.message ? e.message : e));
  process.exit(1);
});

main().catch((e) => {
  showError(L("無法啟動 MarkFlow Studio:", "Could not start MarkFlow Studio: ") + (e && e.message ? e.message : e));
  process.exit(1);
});
