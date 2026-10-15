/**
 * Structural sanity check for Windows executables (PE files).
 *
 *   node scripts/pe-check.mjs <exe> [reference.exe]
 *
 * It validates the PE headers, sections and — most importantly — the base-relocation table, which is what
 * a bad resource edit breaks: the program may still start on a machine where it happens to load at its
 * preferred address, and crash on others. With a reference executable it also checks that the relocation
 * table is identical to the original, i.e. nothing was damaged by editing the icon/version resources or
 * injecting the application.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function parsePe(buf) {
  if (buf.length < 0x40 || buf.readUInt16LE(0) !== 0x5a4d) throw new Error("not a DOS/PE file (missing MZ)");
  const pe = buf.readUInt32LE(0x3c);
  if (buf.toString("latin1", pe, pe + 4) !== "PE\0\0") throw new Error("missing PE signature");
  const numSections = buf.readUInt16LE(pe + 6);
  const optSize = buf.readUInt16LE(pe + 20);
  const opt = pe + 24;
  const magic = buf.readUInt16LE(opt);
  if (magic !== 0x20b) throw new Error("only PE32+ (64-bit) is supported");
  const imageSize = buf.readUInt32LE(opt + 56);
  const subsystem = buf.readUInt16LE(opt + 68);
  const dirBase = opt + 112;
  const dir = (i) => ({ rva: buf.readUInt32LE(dirBase + i * 8), size: buf.readUInt32LE(dirBase + i * 8 + 4) });
  const sectionsAt = opt + optSize;
  const sections = [];
  for (let i = 0; i < numSections; i++) {
    const o = sectionsAt + i * 40;
    sections.push({
      name: buf.toString("latin1", o, o + 8).replace(/\0+$/, ""),
      virtualSize: buf.readUInt32LE(o + 8),
      rva: buf.readUInt32LE(o + 12),
      rawSize: buf.readUInt32LE(o + 16),
      rawPtr: buf.readUInt32LE(o + 20),
    });
  }
  return { pe, imageSize, subsystem, sections, resource: dir(2), reloc: dir(5), certificate: dir(4) };
}

const sectionOf = (info, rva) => info.sections.find((s) => rva >= s.rva && rva < s.rva + Math.max(s.virtualSize, s.rawSize));

function rvaToOffset(info, rva) {
  const s = sectionOf(info, rva);
  return s ? s.rawPtr + (rva - s.rva) : -1;
}

/** Walk the relocation blocks. Throws on any inconsistency. */
export function relocations(buf, info = parsePe(buf)) {
  const { rva, size } = info.reloc;
  if (size === 0) throw new Error("no base-relocation table");
  const start = rvaToOffset(info, rva);
  if (start < 0 || start + size > buf.length) throw new Error("relocation directory lies outside the file");
  const blocks = [];
  const hash = createHash("sha256");
  let off = 0;
  let entries = 0;
  while (off + 8 <= size) {
    const pageRva = buf.readUInt32LE(start + off);
    const blockSize = buf.readUInt32LE(start + off + 4);
    if (pageRva === 0 && blockSize === 0) break; // trailing padding
    if (blockSize < 8 || blockSize % 2 !== 0 || off + blockSize > size) {
      throw new Error(`relocation block at +${off} has a bad size (${blockSize}); directory size ${size}`);
    }
    if (pageRva >= info.imageSize) throw new Error(`relocation block page 0x${pageRva.toString(16)} is outside the image`);
    const n = (blockSize - 8) / 2;
    for (let i = 0; i < n; i++) {
      const e = buf.readUInt16LE(start + off + 8 + i * 2);
      if (e >> 12 === 0) continue; // padding entry
      const target = pageRva + (e & 0xfff);
      if (!sectionOf(info, target)) throw new Error(`relocation target 0x${target.toString(16)} is not inside any section`);
    }
    hash.update(buf.subarray(start + off, start + off + blockSize));
    blocks.push({ pageRva, n });
    entries += n;
    off += blockSize;
  }
  return { blocks: blocks.length, entries, digest: hash.digest("hex") };
}

export function checkPe(buf, reference) {
  const info = parsePe(buf);
  const problems = [];
  const reloc = (() => {
    try {
      return relocations(buf, info);
    } catch (e) {
      problems.push(e.message);
      return null;
    }
  })();
  for (const s of info.sections) {
    if (s.rawPtr + s.rawSize > buf.length) problems.push(`section ${s.name} extends past the end of the file`);
  }
  if (info.resource.size && !sectionOf(info, info.resource.rva)) problems.push("resource directory is not inside any section");
  if (reference && reloc) {
    try {
      const ref = relocations(reference);
      if (ref.blocks !== reloc.blocks || ref.entries !== reloc.entries || ref.digest !== reloc.digest) {
        problems.push(`relocation table differs from the reference (blocks ${reloc.blocks} vs ${ref.blocks}, entries ${reloc.entries} vs ${ref.entries})`);
      }
    } catch (e) {
      problems.push("reference executable: " + e.message);
    }
  }
  return { ok: problems.length === 0, problems, subsystem: info.subsystem, reloc, sections: info.sections.map((s) => s.name) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [, , file, ref] = process.argv;
  if (!file) {
    console.error("usage: node scripts/pe-check.mjs <exe> [reference.exe]");
    process.exit(2);
  }
  const r = checkPe(readFileSync(file), ref ? readFileSync(ref) : undefined);
  console.log(JSON.stringify({ ok: r.ok, subsystem: r.subsystem, relocBlocks: r.reloc?.blocks, relocEntries: r.reloc?.entries, sections: r.sections, problems: r.problems }, null, 2));
  process.exit(r.ok ? 0 : 1);
}
