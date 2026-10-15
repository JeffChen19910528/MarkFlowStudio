import { type MessageKey, t } from "../i18n";
import type { FolderRef } from "../shared/fileRef";
import { normalizeImagePath } from "./path";
import { sniffImage } from "./sniff";
import {
  ImageError,
  type ImageErrorCode,
  type ImageLoadResult,
  MAX_IMAGES,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_PIXELS,
  MAX_TOTAL_IMAGE_BYTES,
  type ResolvedImage,
} from "./types";

/** SVG is excluded on purpose: it can carry scripts and is not supported by DOCX. */
const EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);

const MESSAGE_KEYS: Record<ImageErrorCode, MessageKey> = {
  "unsafe-path": "image.unsafePath",
  "unsupported-type": "image.unsupportedType",
  "not-found": "image.notFound",
  "too-large": "image.tooLarge",
  "not-an-image": "image.notAnImage",
  denied: "image.denied",
};
const msg = (code: ImageErrorCode): string => t(MESSAGE_KEYS[code]);
export const describeImageError = (e: unknown): string =>
  e instanceof ImageError ? msg(e.code) : e instanceof Error ? e.message : String(e);

/** Read one image from inside `root`. Throws ImageError. */
export async function resolveImage(root: FolderRef, src: string): Promise<ResolvedImage> {
  const segments = normalizeImagePath(src);
  if (!segments) throw new ImageError("unsafe-path", msg("unsafe-path"));
  const name = segments[segments.length - 1];
  const ext = /\.([^.]+)$/.exec(name)?.[1].toLowerCase() ?? "";
  if (!EXTENSIONS.has(ext)) throw new ImageError("unsupported-type", msg("unsupported-type"));

  try {
    let dir: FolderRef = root;
    for (const seg of segments.slice(0, -1)) dir = await dir.getDirectoryHandle(seg);
    const file = await (await dir.getFileHandle(name)).getFile();
    if (file.size > MAX_IMAGE_BYTES) throw new ImageError("too-large", msg("too-large"));
    const bytes = new Uint8Array(await file.arrayBuffer());
    const info = sniffImage(bytes);
    if (!info || info.width < 1 || info.height < 1) throw new ImageError("not-an-image", msg("not-an-image"));
    if (info.width * info.height > MAX_IMAGE_PIXELS) throw new ImageError("too-large", t("image.tooManyPixels"));
    return { bytes, ...info };
  } catch (e) {
    if (e instanceof ImageError) throw e;
    const n = (e as { name?: string })?.name;
    if (n === "NotAllowedError" || n === "SecurityError") throw new ImageError("denied", msg("denied"));
    // NotFoundError, TypeMismatchError (a folder where a file was expected), invalid names...
    throw new ImageError("not-found", msg("not-found"));
  }
}

/** Resolve many images, enforcing the count and total-size limits. Never throws. */
export async function resolveImages(root: FolderRef, srcs: readonly string[]): Promise<ImageLoadResult> {
  const images = new Map<string, ResolvedImage>();
  const failures: ImageLoadResult["failures"] = [];
  let total = 0;
  for (const src of [...new Set(srcs)]) {
    if (images.size >= MAX_IMAGES) {
      failures.push({ src, message: t("image.tooMany", { n: MAX_IMAGES }) });
      continue;
    }
    try {
      const img = await resolveImage(root, src);
      if (total + img.bytes.length > MAX_TOTAL_IMAGE_BYTES) {
        failures.push({ src, message: t("image.totalTooLarge") });
        continue;
      }
      total += img.bytes.length;
      images.set(src, img);
    } catch (e) {
      failures.push({ src, message: describeImageError(e) });
    }
  }
  return { images, failures };
}
