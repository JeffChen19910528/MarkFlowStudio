import type { ResolvedImage } from "./types";

export function toDataUri(img: ResolvedImage): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < img.bytes.length; i += chunk) bin += String.fromCharCode(...img.bytes.subarray(i, i + chunk));
  return `data:${img.mime};base64,${btoa(bin)}`;
}
