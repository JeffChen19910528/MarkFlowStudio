import { t } from "../i18n";

export type PageSize = "A4" | "Letter" | "Custom";
export type Orientation = "portrait" | "landscape";

export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PdfOptions {
  pageSize: PageSize;
  customWidthMm: number;
  customHeightMm: number;
  orientation: Orientation;
  marginsMm: Margins;
  includeBackground: boolean;
  pageNumbers: boolean;
  headerText: string;
  footerText: string;
  keepLinks: boolean;
  wrapCode: boolean;
}

export const PDF_LIMITS = {
  pageMm: [50, 1000],
  marginMm: [0, 100],
  textLength: 120,
} as const;

export const DEFAULT_PDF_OPTIONS: PdfOptions = {
  pageSize: "A4",
  customWidthMm: 210,
  customHeightMm: 297,
  orientation: "portrait",
  marginsMm: { top: 20, right: 20, bottom: 20, left: 20 },
  includeBackground: false,
  pageNumbers: true,
  headerText: "",
  footerText: "",
  keepLinks: true,
  wrapCode: true,
};

const clamp = (n: unknown, [lo, hi]: readonly [number, number] | readonly number[], fallback: number) =>
  typeof n === "number" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;

const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);

const text = (v: unknown) =>
  typeof v === "string"
    ? [...v].filter((c) => c.charCodeAt(0) >= 32).join("").slice(0, PDF_LIMITS.textLength)
    : "";

/** Coerce arbitrary (e.g. persisted) data into valid options. */
export function sanitizePdfOptions(input: unknown): PdfOptions {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const m = (o.marginsMm && typeof o.marginsMm === "object" ? o.marginsMm : {}) as Record<string, unknown>;
  const d = DEFAULT_PDF_OPTIONS;
  return {
    pageSize: o.pageSize === "A4" || o.pageSize === "Letter" || o.pageSize === "Custom" ? o.pageSize : d.pageSize,
    customWidthMm: clamp(o.customWidthMm, PDF_LIMITS.pageMm, d.customWidthMm),
    customHeightMm: clamp(o.customHeightMm, PDF_LIMITS.pageMm, d.customHeightMm),
    orientation: o.orientation === "landscape" ? "landscape" : "portrait",
    marginsMm: {
      top: clamp(m.top, PDF_LIMITS.marginMm, d.marginsMm.top),
      right: clamp(m.right, PDF_LIMITS.marginMm, d.marginsMm.right),
      bottom: clamp(m.bottom, PDF_LIMITS.marginMm, d.marginsMm.bottom),
      left: clamp(m.left, PDF_LIMITS.marginMm, d.marginsMm.left),
    },
    includeBackground: bool(o.includeBackground, d.includeBackground),
    pageNumbers: bool(o.pageNumbers, d.pageNumbers),
    headerText: text(o.headerText),
    footerText: text(o.footerText),
    keepLinks: bool(o.keepLinks, d.keepLinks),
    wrapCode: bool(o.wrapCode, d.wrapCode),
  };
}

/** Final page size in mm after applying orientation. */
export function pageDimensionsMm(o: PdfOptions): { width: number; height: number } {
  const [w, h] =
    o.pageSize === "A4" ? [210, 297] : o.pageSize === "Letter" ? [215.9, 279.4] : [o.customWidthMm, o.customHeightMm];
  const [short, long] = [Math.min(w, h), Math.max(w, h)];
  return o.orientation === "landscape" ? { width: long, height: short } : { width: short, height: long };
}

/** Margins must leave a usable content area. Returns a readable message, or null when valid. */
export function pdfOptionsError(o: PdfOptions): string | null {
  const { width, height } = pageDimensionsMm(o);
  const { top, right, bottom, left } = o.marginsMm;
  if (left + right > width - 20) return t("pdf.marginsWidth");
  if (top + bottom > height - 20) return t("pdf.marginsHeight");
  return null;
}

/** Chromium 131+ implements @page margin boxes (page numbers, headers, footers). */
export function supportsPageMarginBoxes(ua: string = typeof navigator === "undefined" ? "" : navigator.userAgent): boolean {
  const m = /\b(?:Chrome|Edg|CriOS)\/(\d+)/.exec(ua);
  return m !== null && Number(m[1]) >= 131;
}
