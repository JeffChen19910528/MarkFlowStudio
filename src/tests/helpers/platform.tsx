import { render } from "@testing-library/react";
import { type Mock, vi } from "vitest";
import { App } from "../../app/App";
import { browserPlatform } from "../../platform/browser";
import { PlatformProvider } from "../../platform/PlatformContext";
import type { FileApi, Platform, Printer, RecentFile, RecentStore } from "../../platform/types";

type Mocked<T> = { [K in keyof T]: T[K] extends (...args: infer A) => infer R ? Mock<(...args: A) => R> : T[K] };

export interface TestPlatform {
  files: Mocked<FileApi>;
  recents: Mocked<RecentStore>;
  printer: Mocked<Printer>;
}

/**
 * A fake platform for UI tests: every operation is a `vi.fn` the test can program and inspect, and
 * nothing touches the real file system, IndexedDB or print dialog. By default every picker is cancelled,
 * the browser has no in-place file access, and recent files are unsupported.
 */
export function makePlatform({ recentsSupported = false }: { recentsSupported?: boolean } = {}): TestPlatform {
  let rows: RecentFile[] = [];

  const files: TestPlatform["files"] = {
    hasNativeFileAccess: vi.fn(() => false),
    openFile: vi.fn<FileApi["openFile"]>(async () => null),
    openFromRef: vi.fn<FileApi["openFromRef"]>(async () => {
      throw new Error("openFromRef was not programmed");
    }),
    saveFile: vi.fn<FileApi["saveFile"]>(async () => null),
    saveFileAs: vi.fn<FileApi["saveFileAs"]>(async () => null),
    exportToFile: vi.fn<FileApi["exportToFile"]>(async () => null),
    pickImportFile: vi.fn<FileApi["pickImportFile"]>(async () => null),
    hasFolderPicker: vi.fn(() => false),
    pickImageFolder: vi.fn<FileApi["pickImageFolder"]>(async () => null),
  };

  const recents: TestPlatform["recents"] = {
    supported: recentsSupported,
    list: vi.fn<RecentStore["list"]>(async () => [...rows].sort((a, b) => b.openedAt - a.openedAt)),
    add: vi.fn<RecentStore["add"]>(async (ref) => {
      rows = rows.filter((r) => r.name !== ref.name);
      rows.push({ id: `id-${ref.name}`, name: ref.name, openedAt: rows.length + 1, handle: ref });
    }),
    remove: vi.fn<RecentStore["remove"]>(async (id) => void (rows = rows.filter((r) => r.id !== id))),
    clear: vi.fn<RecentStore["clear"]>(async () => void (rows = [])),
  };

  return { files, recents, printer: { printHtml: vi.fn<Printer["printHtml"]>(async () => undefined) } };
}

export const renderApp = (platform: Platform) =>
  render(
    <PlatformProvider value={platform}>
      <App />
    </PlatformProvider>,
  );

/** The real browser implementation with only the print dialog faked (for tests that exercise real file writing). */
export function browserPlatformWithFakePrinter(): { platform: Platform; printer: Mocked<Printer> } {
  const printer: Mocked<Printer> = { printHtml: vi.fn<Printer["printHtml"]>(async () => undefined) };
  return { platform: { ...browserPlatform, printer }, printer };
}
