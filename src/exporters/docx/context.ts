import { HeadingLevel } from "docx";
import type { FontKey } from "../../themes/themes";
import type { ResolvedImage } from "../../images";

export const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];

export const FONTS: Record<FontKey, { ascii: string; eastAsia: string }> = {
  system: { ascii: "Calibri", eastAsia: "Microsoft JhengHei" },
  sans: { ascii: "Arial", eastAsia: "Microsoft JhengHei" },
  serif: { ascii: "Times New Roman", eastAsia: "PMingLiU" },
  mono: { ascii: "Consolas", eastAsia: "MingLiU" },
};
export const MONO = { ascii: "Consolas", eastAsia: "MingLiU", hAnsi: "Consolas" };

export const hex = (c: string) => c.replace("#", "").toUpperCase();
export const PX_TO_HALF_POINTS = 1.5; // 1px = 0.75pt = 1.5 half-points
export const PX_TO_TWIPS = 15;
export const LIST_INDENT = 720;
export const QUOTE_INDENT = 480;
export const MAX_LIST_LEVELS = 9;
/** DOCX can embed these; WebP is not a Word image type. */
export const DOCX_IMAGE_TYPES: Record<ResolvedImage["mime"], "png" | "jpg" | "gif" | undefined> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": undefined,
};
/** Printable area of the A4 page used below is about 605 x 900 px; never upscale. */
export const MAX_IMAGE_WIDTH_PX = 600;
export const MAX_IMAGE_HEIGHT_PX = 800;

export function fitImage(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, MAX_IMAGE_WIDTH_PX / width, MAX_IMAGE_HEIGHT_PX / height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export interface Ctx {
  warnings: Set<string>;
  /** Images that could not be embedded (missing, not resolved, or an unsupported format). */
  skippedImages: number;
  unsupportedFormat: number;
  embeddedImages: number;
  imageMap: ReadonlyMap<string, ResolvedImage>;
  colors: { text: string; link: string; code: string; heading: string };
  halfPoints: number;
  lists: { ordered: boolean; instance: number }[];
  orderedInstances: number;
  /** True until the first paragraph of the current list item has been emitted (it carries the marker). */
  itemFirst: boolean;
  quote: number;
}

export type RunStyle = { bold?: boolean; italics?: boolean; strike?: boolean };
