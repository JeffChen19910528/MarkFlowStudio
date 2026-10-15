import type { ResolvedImage } from "./types";

const be32 = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);
const ascii = (b: Uint8Array, at: number, s: string) => [...s].every((c, i) => b[at + i] === c.charCodeAt(0));

/** Identify an image from its bytes and read its pixel size. Returns null if it is not a supported image. */
export function sniffImage(b: Uint8Array): Omit<ResolvedImage, "bytes"> | null {
  if (b.length >= 24 && startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) && ascii(b, 12, "IHDR")) {
    return { mime: "image/png", width: be32(b, 16), height: be32(b, 20) };
  }
  if (b.length >= 10 && ascii(b, 0, "GIF8") && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) {
    return { mime: "image/gif", width: b[6] | (b[7] << 8), height: b[8] | (b[9] << 8) };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      if (marker === 0xff) {
        i++;
        continue;
      }
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) return { mime: "image/jpeg", height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
        i += 2;
        continue;
      }
      i += 2 + ((b[i + 2] << 8) | b[i + 3]);
    }
    return null;
  }
  if (b.length >= 30 && ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP")) {
    if (ascii(b, 12, "VP8 ")) return { mime: "image/webp", width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff };
    if (ascii(b, 12, "VP8L") && b[20] === 0x2f) {
      return {
        mime: "image/webp",
        width: 1 + (((b[22] & 0x3f) << 8) | b[21]),
        height: 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)),
      };
    }
    if (ascii(b, 12, "VP8X")) {
      return {
        mime: "image/webp",
        width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)),
        height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)),
      };
    }
  }
  return null;
}
