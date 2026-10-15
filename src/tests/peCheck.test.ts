// @vitest-environment node
import { readFileSync } from "node:fs";
import { checkPe, parsePe, relocations } from "../../scripts/pe-check.mjs";

/**
 * Regression tests for the packaging bug where a pure-JS resource editor silently destroyed the
 * executable's relocation table (0 blocks instead of ~670). The program still started on this machine
 * but could fail to load elsewhere. These need a real Windows PE file, so they use node.exe.
 */
const onWindows = process.platform === "win32";

describe.skipIf(!onWindows)("PE structure check (uses the running node.exe)", () => {
  const node = onWindows ? readFileSync(process.execPath) : Buffer.alloc(0);

  it("accepts an untouched executable and reads its relocation table", () => {
    const r = checkPe(node, node);
    expect(r.ok).toBe(true);
    expect(r.reloc!.blocks).toBeGreaterThan(100);
    expect(r.reloc!.entries).toBeGreaterThan(10_000);
    expect(r.subsystem).toBe(3); // console program
  });

  it("detects an emptied relocation directory", () => {
    const broken = Buffer.from(node);
    const info = parsePe(broken);
    const dirEntry = info.pe + 24 + 112 + 5 * 8; // data directory #5: base relocations
    broken.writeUInt32LE(0, dirEntry + 4);
    expect(checkPe(broken).ok).toBe(false);
    expect(() => relocations(broken)).toThrow(/no base-relocation table/);
  });

  it("detects a damaged relocation block", () => {
    const broken = Buffer.from(node);
    const info = parsePe(broken);
    const section = info.sections.find((s) => s.name === ".reloc")!;
    broken.writeUInt32LE(0x7fffffff, section.rawPtr + 4); // absurd SizeOfBlock in the first block
    const r = checkPe(broken);
    expect(r.ok).toBe(false);
    expect(r.problems.join()).toMatch(/bad size/);
  });

  it("detects a relocation table that differs from the reference (the actual bug)", () => {
    const stripped = Buffer.from(node);
    const info = parsePe(stripped);
    stripped.fill(0, info.sections.find((s) => s.name === ".reloc")!.rawPtr, info.sections.find((s) => s.name === ".reloc")!.rawPtr + 64);
    const r = checkPe(stripped, node);
    expect(r.ok).toBe(false);
  });

  it("rejects things that are not PE files", () => {
    expect(() => parsePe(Buffer.from("hello world, definitely not an executable......."))).toThrow(/MZ/);
    const noPe = Buffer.alloc(256);
    noPe.writeUInt16LE(0x5a4d, 0);
    noPe.writeUInt32LE(128, 0x3c);
    expect(() => parsePe(noPe)).toThrow(/PE signature/);
  });
});
