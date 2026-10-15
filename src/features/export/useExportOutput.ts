import { useEffect, useMemo, useState } from "react";
import type { BinaryOutput, ExportInput, Exporter } from "../../exporters/types";

export interface ExportResult {
  content: string | Uint8Array<ArrayBuffer>;
  warnings: string[];
}

interface BinaryState {
  input: ExportInput;
  exporter: Exporter;
  out: BinaryOutput | null;
  error: string | null;
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Run the chosen exporter on the current input. Text formats convert synchronously; binary formats
 * (DOCX) convert asynchronously and results that no longer match the input are ignored.
 * Nothing runs while `enabled` is false.
 */
export function useExportOutput(exporter: Exporter, input: ExportInput, enabled: boolean) {
  const [binary, setBinary] = useState<BinaryState | null>(null);

  const text = useMemo<{ out: ExportResult | null; error: string | null }>(() => {
    if (!exporter.export || !enabled) return { out: null, error: null };
    try {
      return { out: exporter.export(input), error: null };
    } catch (e) {
      return { out: null, error: errorMessage(e) };
    }
  }, [exporter, input, enabled]);

  useEffect(() => {
    if (!exporter.exportBinary || !enabled) return;
    let cancelled = false;
    exporter.exportBinary(input).then(
      (out) => !cancelled && setBinary({ input, exporter, out, error: null }),
      (e) => !cancelled && setBinary({ input, exporter, out: null, error: errorMessage(e) }),
    );
    return () => {
      cancelled = true;
    };
  }, [exporter, input, enabled]);

  if (!exporter.exportBinary) return { ...text, generating: false };
  const current = binary && binary.input === input && binary.exporter === exporter ? binary : null;
  return {
    out: current?.out ? { content: current.out.data, warnings: current.out.warnings } : null,
    error: current?.error ?? null,
    generating: enabled && current === null,
  };
}
