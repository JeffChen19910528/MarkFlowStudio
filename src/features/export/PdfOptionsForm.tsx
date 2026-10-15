import { NumberField } from "../../components/NumberField";
import { PDF_LIMITS, type PageSize, type PdfOptions, sanitizePdfOptions } from "../../exporters/pdfOptions";
import type { MessageKey } from "../../i18n";
import { useT } from "../../i18n/react";

interface Props {
  value: PdfOptions;
  onChange: (next: PdfOptions) => void;
  disabled?: boolean;
}

const MARGINS: readonly (readonly ["top" | "right" | "bottom" | "left", MessageKey])[] = [
  ["top", "pdf.margin.top"],
  ["right", "pdf.margin.right"],
  ["bottom", "pdf.margin.bottom"],
  ["left", "pdf.margin.left"],
];

export function PdfOptionsForm({ value: v, onChange, disabled }: Props) {
  const t = useT();
  const set = (patch: Partial<PdfOptions>) => onChange(sanitizePdfOptions({ ...v, ...patch }));

  return (
    <fieldset className="pdf-options" disabled={disabled}>
      <legend>{t("pdf.legend")}</legend>

      <div className="grid2">
        <label className="field">
          <span>{t("pdf.pageSize")}</span>
          <select value={v.pageSize} onChange={(e) => set({ pageSize: e.target.value as PageSize })}>
            <option value="A4">A4</option>
            <option value="Letter">Letter</option>
            <option value="Custom">{t("pdf.custom")}</option>
          </select>
        </label>
        <label className="field">
          <span>{t("pdf.orientation")}</span>
          <select value={v.orientation} onChange={(e) => set({ orientation: e.target.value as PdfOptions["orientation"] })}>
            <option value="portrait">{t("pdf.portrait")}</option>
            <option value="landscape">{t("pdf.landscape")}</option>
          </select>
        </label>
      </div>

      {v.pageSize === "Custom" && (
        <div className="grid2">
          <NumberField label={t("pdf.width")} value={v.customWidthMm} range={PDF_LIMITS.pageMm} step={1} onCommit={(n) => set({ customWidthMm: n })} />
          <NumberField label={t("pdf.height")} value={v.customHeightMm} range={PDF_LIMITS.pageMm} step={1} onCommit={(n) => set({ customHeightMm: n })} />
        </div>
      )}

      <div className="grid4">
        {MARGINS.map(([key, label]) => (
          <NumberField
            key={key}
            label={t(label)}
            value={v.marginsMm[key]}
            range={PDF_LIMITS.marginMm}
            step={1}
            onCommit={(n) => set({ marginsMm: { ...v.marginsMm, [key]: n } })}
          />
        ))}
      </div>
      <span className="muted">{t("pdf.marginUnit")}</span>

      <label className="field">
        <span>{t("pdf.header")}</span>
        <input aria-label={t("pdf.header")} maxLength={PDF_LIMITS.textLength} value={v.headerText} onChange={(e) => set({ headerText: e.target.value })} />
      </label>
      <label className="field">
        <span>{t("pdf.footer")}</span>
        <input aria-label={t("pdf.footer")} maxLength={PDF_LIMITS.textLength} value={v.footerText} onChange={(e) => set({ footerText: e.target.value })} />
      </label>

      <label className="check"><input type="checkbox" checked={v.pageNumbers} onChange={(e) => set({ pageNumbers: e.target.checked })} />{t("pdf.pageNumbers")}</label>
      <label className="check"><input type="checkbox" checked={v.includeBackground} onChange={(e) => set({ includeBackground: e.target.checked })} />{t("pdf.background")}</label>
      <label className="check"><input type="checkbox" checked={v.keepLinks} onChange={(e) => set({ keepLinks: e.target.checked })} />{t("pdf.keepLinks")}</label>
      <label className="check"><input type="checkbox" checked={v.wrapCode} onChange={(e) => set({ wrapCode: e.target.checked })} />{t("pdf.wrapCode")}</label>
    </fieldset>
  );
}
