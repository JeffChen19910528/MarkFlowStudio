/** True for `src` values that point at a file relative to the document (not http(s), data:, blob:, absolute...). */
export function isLocalImageSrc(src: string | null | undefined): boolean {
  if (!src) return false;
  const s = src.trim();
  if (s === "" || s.startsWith("//") || s.startsWith("/") || s.startsWith("#")) return false;
  return !/^[a-z][a-z0-9+.-]*:/i.test(s);
}

/**
 * Turn a relative image path into folder-relative path segments, or null when it is unsafe
 * (absolute, has a scheme, uses backslashes/control characters, or climbs above the folder).
 */
export function normalizeImagePath(src: string): string[] | null {
  if (!isLocalImageSrc(src)) return null;
  let path = src.trim().split(/[?#]/)[0];
  try {
    path = decodeURIComponent(path);
  } catch {
    return null;
  }
  if (path.includes("\\") || [...path].some((c) => c.charCodeAt(0) < 32)) return null;
  const out: string[] = [];
  for (const seg of path.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (out.length === 0) return null; // would leave the granted folder
      out.pop();
    } else {
      out.push(seg);
    }
  }
  return out.length > 0 ? out : null;
}
