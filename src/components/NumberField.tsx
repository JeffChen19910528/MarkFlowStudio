import { useState } from "react";

export function NumberField({
  label,
  value,
  range,
  step,
  onCommit,
}: {
  label: string;
  value: number;
  range: readonly [number, number] | readonly number[];
  step: number;
  onCommit: (n: number) => void;
}) {
  // Keep a text draft so typing "1" on the way to "16" is not clamped to the minimum mid-edit.
  const [draft, setDraft] = useState<string | null>(null);
  const [lo, hi] = range;
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        min={lo}
        max={hi}
        step={step}
        value={draft ?? String(value)}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(n) && n >= lo && n <= hi) onCommit(n);
        }}
        onBlur={(e) => {
          const n = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(n)) onCommit(Math.min(hi, Math.max(lo, n)));
          setDraft(null);
        }}
      />
    </label>
  );
}
