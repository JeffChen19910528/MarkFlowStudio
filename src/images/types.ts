/**
 * Local images referenced from Markdown (`![alt](./pics/a.png)`).
 *
 * A browser cannot know where a document's images live, so the user grants read access to one
 * folder per document. Relative paths are resolved *inside* that folder only, and image bytes are
 * treated as untrusted: type comes from the file's content and size and pixel count are capped.
 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGES = 100;
export const MAX_TOTAL_IMAGE_BYTES = 30 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 50_000_000;

export type ImageErrorCode =
  | "unsafe-path"
  | "unsupported-type"
  | "not-found"
  | "too-large"
  | "not-an-image"
  | "denied";

export class ImageError extends Error {
  readonly code: ImageErrorCode;
  constructor(code: ImageErrorCode, message: string) {
    super(message);
    this.name = "ImageError";
    this.code = code;
  }
}

export interface ResolvedImage {
  bytes: Uint8Array<ArrayBuffer>;
  mime: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
  width: number;
  height: number;
}

export interface ImageLoadResult {
  /** Keyed by the exact `src` attribute in the rendered HTML, so exporters can look images up directly. */
  images: Map<string, ResolvedImage>;
  failures: { src: string; message: string }[];
}
