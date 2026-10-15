/**
 * Regenerates assets/icon.ico from public/favicon.svg using a headless Chrome/Edge (set MARKFLOW_CHROME).
 * The result is committed, so normal builds do not need a browser; run this only when the logo changes.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const chrome = process.env.MARKFLOW_CHROME;
if (!chrome) throw new Error("Set MARKFLOW_CHROME to a Chrome/Edge executable.");

const SIZES = [16, 24, 32, 48, 64, 128, 256];
const svg = readFileSync(new URL("../public/favicon.svg", import.meta.url), "utf8");
const dir = mkdtempSync(join(tmpdir(), "markflow-icon-"));
const pngs = [];
try {
  for (const size of SIZES) {
    const html = join(dir, `i${size}.html`);
    const png = join(dir, `i${size}.png`);
    writeFileSync(
      html,
      `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}`,
    );
    execFileSync(
      chrome,
      ["--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", "--default-background-color=00000000", `--window-size=${size},${size}`, `--user-data-dir=${join(dir, "p" + size)}`, `--screenshot=${png}`, pathToFileURL(html).href],
      { stdio: "ignore", timeout: 60000 },
    );
    pngs.push({ size, data: readFileSync(png) });
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

// ICO container holding PNG-compressed images (supported since Windows Vista).
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(pngs.length, 4);
let offset = 6 + 16 * pngs.length;
const entries = pngs.map(({ size, data }) => {
  const e = Buffer.alloc(16);
  e[0] = size >= 256 ? 0 : size;
  e[1] = size >= 256 ? 0 : size;
  e.writeUInt16LE(1, 4); // planes
  e.writeUInt16LE(32, 6); // bits per pixel
  e.writeUInt32LE(data.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += data.length;
  return e;
});
const out = new URL("../assets/icon.ico", import.meta.url);
writeFileSync(out, Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]));
console.log(`wrote assets/icon.ico (${offset} bytes, sizes ${SIZES.join(", ")})`);
