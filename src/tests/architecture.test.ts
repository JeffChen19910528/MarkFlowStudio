// @vitest-environment node
/**
 * Architecture rules. These tests read the source and fail when the structure drifts: a lower layer
 * importing a higher one, an import cycle, browser file APIs used outside the platform layer, features
 * reaching into each other, or a file growing into a catch-all.
 *
 * Layers, from the bottom up (a layer may import only what is listed for it):
 *
 *   i18n     interface text (any layer may use it; it imports nothing)
 *   shared   plain types and pure helpers (documents, tabs, errors, FileRef...)
 *   themes · images · markdown        domain logic with no UI and no platform
 *   exporters · importers             pure converters
 *   files                             browser file-system implementation
 *   platform                          the Platform interface, its context, and the browser implementation
 *   settings                          persisted preferences
 *   components · editor · preview     UI building blocks
 *   features                          one folder per user-facing feature
 *   app                               composition root
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const SRC = resolve(__dirname, "..");

const ALLOWED: Record<string, string[]> = {
  i18n: [],
  shared: [],
  themes: ["shared"],
  images: ["shared"],
  markdown: ["shared", "images"],
  exporters: ["shared", "themes", "images", "markdown"],
  importers: ["shared"],
  files: ["shared"],
  platform: ["shared", "files"],
  settings: ["shared", "themes", "exporters"],
  components: ["shared"],
  editor: [],
  preview: ["shared", "images", "markdown"],
  features: ["shared", "themes", "images", "markdown", "exporters", "importers", "settings", "components", "preview", "platform", "editor"],
  app: ["*"],
};

const MAX_LINES = 300;

interface Source {
  /** Path relative to src, with forward slashes: "features/export/ExportDialog.tsx". */
  file: string;
  layer: string;
  text: string;
  /** Imported project files, as paths relative to src without extension. */
  imports: string[];
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listFiles(join(dir, e.name)) : [join(dir, e.name)]));
}

const rel = (p: string) => relative(SRC, p).split(sep).join("/");
const layerOf = (file: string) => (file.includes("/") ? file.split("/")[0] : "(root)");

function load(): Source[] {
  const all = listFiles(SRC).filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".d.ts") && !rel(f).startsWith("tests/"));
  const stems = new Set(all.map((f) => rel(f).replace(/\.(ts|tsx)$/, "")));
  return all.map((f) => {
    const text = readFileSync(f, "utf8");
    const imports = new Set<string>();
    for (const m of text.matchAll(/(?:from\s+|import\s*\(\s*)["'](\.{1,2}\/[^"']*)["']/g)) {
      const base = rel(resolve(dirname(f), m[1]));
      for (const candidate of [base, base + "/index"]) if (stems.has(candidate)) imports.add(candidate);
    }
    return { file: rel(f), layer: layerOf(rel(f)), text, imports: [...imports] };
  });
}

const sources = load();
const stemOf = (s: Source) => s.file.replace(/\.(ts|tsx)$/, "");

describe("architecture", () => {
  it("every source folder is a known layer", () => {
    const known = new Set([...Object.keys(ALLOWED), "(root)"]);
    expect([...new Set(sources.map((s) => s.layer))].filter((l) => !known.has(l))).toEqual([]);
  });

  it("layers only depend on the layers below them", () => {
    const violations: string[] = [];
    for (const s of sources) {
      const allowed = ALLOWED[s.layer];
      if (!allowed || allowed.includes("*")) continue;
      for (const imp of s.imports) {
        const target = layerOf(imp + ".ts");
        if (target !== s.layer && target !== "i18n" && !allowed.includes(target)) violations.push(`${s.file} → ${imp}  (${s.layer} must not depend on ${target})`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("there are no import cycles between files", () => {
    const graph = new Map(sources.map((s) => [stemOf(s), s.imports]));
    const cycles = new Set<string>();
    const stack: string[] = [];
    const done = new Set<string>();
    const visit = (n: string) => {
      const at = stack.indexOf(n);
      if (at >= 0) {
        cycles.add([...stack.slice(at), n].join(" → "));
        return;
      }
      if (done.has(n)) return;
      stack.push(n);
      for (const d of graph.get(n) ?? []) visit(d);
      stack.pop();
      done.add(n);
    };
    for (const n of graph.keys()) visit(n);
    expect([...cycles]).toEqual([]);
  });

  it("there are no import cycles between folders", () => {
    const edges = new Map<string, Set<string>>();
    for (const s of sources) {
      for (const imp of s.imports) {
        const to = layerOf(imp + ".ts");
        if (to === s.layer || s.layer === "app" || s.layer === "(root)") continue;
        (edges.get(s.layer) ?? edges.set(s.layer, new Set()).get(s.layer)!).add(to);
      }
    }
    const cycles: string[] = [];
    for (const [a, targets] of edges) for (const b of targets) if (edges.get(b)?.has(a) && a < b) cycles.push(`${a} ⇄ ${b}`);
    expect(cycles).toEqual([]);
  });

  it("browser file-system and storage APIs are used only by files/ and platform/", () => {
    const API = /\b(showOpenFilePicker|showSaveFilePicker|showDirectoryPicker|indexedDB|FileSystemFileHandle|FileSystemDirectoryHandle|FileSystemWritableFileStream)\b/;
    const offenders = sources.filter((s) => s.layer !== "files" && s.layer !== "platform" && API.test(s.text)).map((s) => s.file);
    expect(offenders).toEqual([]);
  });

  it("features get the platform through usePlatform(), never the browser implementation", () => {
    const offenders = sources
      .filter((s) => s.layer === "features" && s.imports.some((i) => i === "platform/browser" || i.startsWith("files/")))
      .map((s) => s.file);
    expect(offenders).toEqual([]);
  });

  it("features do not import each other (shared behaviour belongs in a lower layer)", () => {
    const featureOf = (file: string) => file.split("/")[1];
    const offenders: string[] = [];
    for (const s of sources.filter((x) => x.layer === "features")) {
      for (const imp of s.imports.filter((i) => i.startsWith("features/"))) {
        if (featureOf(imp + ".ts") !== featureOf(s.file)) offenders.push(`${s.file} → ${imp}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it(`no source file exceeds ${MAX_LINES} lines`, () => {
    // The message catalogues are flat data tables, one line per message; they grow with the UI.
    const big = sources.filter((s) => s.layer !== "i18n").map((s) => ({ file: s.file, lines: s.text.split("\n").length })).filter((x) => x.lines > MAX_LINES);
    expect(big).toEqual([]);
  });

  it("user-visible text lives in i18n/ (no Chinese literals elsewhere in the source)", () => {
    const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
    const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
    const offenders = sources.filter((s) => s.layer !== "i18n" && CJK.test(strip(s.text))).map((s) => s.file);
    expect(offenders).toEqual([]);
  });

  it("converters are free of React and of the platform", () => {
    const offenders = sources
      .filter((s) => ["exporters", "importers", "markdown", "images"].includes(s.layer) && /from\s+["']react["']/.test(s.text))
      .map((s) => s.file);
    expect(offenders).toEqual([]);
  });
});
