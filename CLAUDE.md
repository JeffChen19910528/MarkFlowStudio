# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

MarkFlow Studio: a local-only Markdown editor (React + TypeScript + Vite + CodeMirror 6) with live preview, themes, multi-document tabs, export to HTML/TXT/PDF/DOCX, import from HTML/DOCX, local images, and a one-file Windows executable. The original requirements are in `SKILL.md` (Traditional Chinese). The UI language is zh-TW; code and technical docs are English. Not a git repo. `src-tauri/` is a minimal Tauri 2 shell that only shows the web build in WebView2 (no Rust commands, empty capabilities; file access uses the same File System Access API as the browser). `src/platform/` is the seam for switching to native dialogs later.

User-facing docs: `README.md` (intro + usage only). Developer docs: `docs/` (`ARCHITECTURE`, `TESTING`, `SECURITY`, `FORMAT-SUPPORT`, `PACKAGING`) and `CHANGELOG.md`. Update `docs/FORMAT-SUPPORT.md` whenever an importer/exporter changes.

## Commands

```bash
npm run dev                  # http://localhost:5173
npm run typecheck && npm run lint && npm test && npm run build
npx vitest run src/tests/docx.test.ts        # one file
npx vitest run -t "undo reverts"             # one test by name
npm run package              # build + dist -> release/MarkFlowStudio.exe and .zip (Windows)
npm run desktop              # Tauri build -> release/MarkFlowStudio-Setup-v*.exe + MarkFlowStudio-Desktop.exe (needs Rust + VS C++ build tools)
MARKFLOW_APP_EXE=<path to markflow-studio.exe> npm run smoke:browser   # same checks inside the Tauri window (WebView2)
npm run smoke:browser        # real-Chrome checks; needs MARKFLOW_CHROME and `npx vite preview --port 4173`
MARKFLOW_CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe" npm test -- realBrowser   # opt-in PDF checks
```

A headless Chrome 155 is installed on the dev machine, so UI/layout/PDF changes can and should be verified for real (see "Verification").

## Architecture (read `docs/ARCHITECTURE.md` for detail)

Layers, bottom up; `src/tests/architecture.test.ts` enforces them, so a wrong-direction import fails the test run:

`i18n` (importable from any layer) · `shared` → `themes`, `images`, `markdown` → `exporters`, `importers`, `files` → `platform` → `settings` → `components`, `editor`, `preview` → `features/*` → `app`

- `i18n/`: all user-visible text. `zhTW.ts` is the source catalogue, `en.ts` must define the same keys (typed `Record<MessageKey,string>`; a test also checks placeholders match and English has no Chinese). `t(key, params)` reads a module-level language (`getLanguage/setLanguage/subscribeLanguage`, saved in `localStorage["markflow.language"]`, first run follows `navigator.language`). Components call `useT()` from `i18n/react.ts` so they re-render on a change; non-React code (errors, exporter warnings) just calls `t()` when the message is created. **No Chinese literals outside `i18n/`** (architecture test; comments are exempt) - add a key to both catalogues instead. Never build a translated string at module load (use a function/getter): labels like `Exporter.label` are getters. A new key means: add it to `zhTW.ts` and `en.ts`. Tests run in Chinese (`tests/setup.ts` forces it); language tests are in `tests/i18n.test.tsx`.
- `shared/`: pure types/helpers (`DocumentState`, `workspace` tab model, `FileRef`/`FolderRef`, `FileError`, `Status`).
- `markdown/render.ts` is the **single** Markdown render config (markdown-it with `html:false`, then DOMPurify). Preview and every exporter use it, and TXT/DOCX walk the same parser's tokens. `markdown/markdown-body.css` is shared by the app and the exported HTML (imported with `?raw`; `vite.config.ts` sets `test.css.include` so Vitest does not stub it to `""` - keep it).
- `platform/`: `Platform = { files: FileApi, recents: RecentStore, printer: Printer }`, a React context (`usePlatform`), and `browser.ts` (the only place that casts `FileRef` to `FileSystemFileHandle`). Features get the platform through `usePlatform()`; they must not import `files/` or `platform/browser`.
- `features/<name>/`: one folder per feature (workspace, export, import, settings, shell, shortcuts, sidebar), each with its own hooks and components. **Features must not import each other.** Shared behaviour goes in a lower layer.
- `app/App.tsx` is only composition (`useWorkspace` + `useDocumentActions` + `useRecentFiles` + `useAutosave` + `useEditorCommands` ... then presentational components). Put new logic in a hook or a feature, not in `App`.
- `editor/Editor.tsx` is ONE persistent `EditorView`; switching `docId` stashes `view.state` in a Map and `setState`s the next one (that is what gives each tab its own undo history). Don't go back to remounting per document.
- Exporters: `Exporter` has exactly one of `export` (sync text) or `exportBinary` (async bytes, DOCX). Heavy libs (`docx`, `jszip`, `mammoth`, `turndown`) are loaded with dynamic `import()`; don't add static imports of them from code reachable from `App`.

## Rules that are easy to break

- **Never parse HTML with `div.innerHTML = ...`** (even detached): the browser still fetches every `<img src>`. Use `inertBody()` (`shared/inertDom.ts`, `DOMParser`). The preview strips `src` from all images before they reach the page.
- User-typed text that goes into generated CSS (PDF header/footer) must go through `cssString`.
- Images: relative paths resolve only inside the user-granted folder (`images/path.ts` rejects anything that could leave it, before touching the file system); type comes from the bytes, not the extension; no SVG.
- Exports/imports never overwrite the source file; imports open as a new unsaved document. Opening a file that is already open switches to its tab instead of re-reading it.
- PDF is the browser's print dialog; the app cannot know whether the user saved, so it reports "print dialog opened", never "exported".
- "新增/開啟/匯入" never replace a dirty document; the unsaved prompt is for closing a tab.
- `index.html` CSP is `default-src 'self'; ... img-src 'self' data: blob:`. The packaged launcher sends an equivalent header; keep both in sync.
- Packaging: **do not edit the exe's resources with a pure-JS PE editor** (`resedit` destroyed the relocation table; use `rcedit`). `build-exe.mjs` runs `pe-check.mjs` and fails the build if the executable differs structurally from node.exe.
- mammoth: its Node entry only accepts `{buffer}`, the browser entry (what Vite bundles) accepts `{arrayBuffer}`; `vite.config.ts` aliases `mammoth` to its browser build under `VITEST`. Don't remove that alias.
- Do not add `@types/markdown-it` (markdown-it 15 ships its own types and they conflict).

## Testing

- UI tests use dependency injection, not `vi.mock` of modules: `makePlatform()` / `renderApp(platform)` in `src/tests/helpers/platform.tsx`. Recreate the fake platform in every `beforeEach`.
- Type into CodeMirror with `EditorView.findFromDOM(...).dispatch(...)` (jsdom cannot feed its DOM input).
- jsdom has no layout, real focus, or colour contrast. After UI/layout changes run `npm run smoke:browser`; it caught bugs the unit tests could not (editor collapsing to 0px, duplicate tab names, missing h1, ...).
- `npm audit` reports 3 moderate issues via `mammoth -> argparse -> sprintf-js`; assessed as not reachable in the bundle (see `docs/SECURITY.md`), not fixed.

## Verification before calling UI work done

1. `npm run typecheck && npm run lint && npm test`
2. `npm run build`, serve with `npx vite preview --port 4173`, run `npm run smoke:browser` (59 checks).
3. If packaging or the launcher changed: `npm run package`, then run the smoke test against the exe (`MARKFLOW_NO_BROWSER=1 MARKFLOW_PORTS=<port> .\release\MarkFlowStudio.exe`, then `node scripts/browser-smoke.mjs http://127.0.0.1:<port>/`).

## Shell gotchas on this machine (Windows)

- Pass `C:/...` style paths to Chrome/Python/PowerShell, not Git Bash `/c/...` paths.
- Backslash escapes in strings written through Bash/Python edits were turned into real newlines several times (`"\n"` inside a string literal you are *writing into a file*), and `\uXXXX` and doubled-backslash sequences are also rewritten (even by Write/Edit) - use `\p{Script=Han}` instead of `\u` ranges, and `String.fromCharCode` where a literal backslash is needed. Prefer the Edit/Write tools for code; in tests use `String.fromCharCode(10)`.
- A stray `python -` waits on stdin forever; never leave one in a command.
- `vi.clearAllMocks` keeps queued `mockXOnce` values; build fresh mocks per test.
