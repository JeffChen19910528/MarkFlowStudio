/**
 * Builds the Tauri desktop app and copies the results into release/.
 *
 *   npm run desktop
 *
 * Needs the Rust toolchain (MSVC target) and the Visual Studio C++ build tools. Produces:
 *   release/MarkFlowStudio-Setup-v<version>.exe   installer (per-user, no admin rights needed)
 *   release/MarkFlowStudio-Desktop.exe            the program itself, runs without installing
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const env = { ...process.env, PATH: `${process.env.PATH}${delimiter}${join(homedir(), ".cargo", "bin")}` };

const run = spawnSync("npx", ["tauri", "build"], { cwd: root, env, stdio: "inherit", shell: true });
if (run.status !== 0) {
  console.error("tauri build failed (is Rust + the Visual Studio C++ build tools installed?)");
  process.exit(run.status ?? 1);
}

const out = join(root, "src-tauri", "target", "release");
const release = join(root, "release");
mkdirSync(release, { recursive: true });
copyFileSync(join(out, "bundle", "nsis", `MarkFlow Studio_${version}_x64-setup.exe`), join(release, `MarkFlowStudio-Setup-v${version}.exe`));
copyFileSync(join(out, "markflow-studio.exe"), join(release, "MarkFlowStudio-Desktop.exe"));
console.log(`\nDone: release/MarkFlowStudio-Setup-v${version}.exe and release/MarkFlowStudio-Desktop.exe`);
