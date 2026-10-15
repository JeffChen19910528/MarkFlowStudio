export interface PeInfo {
  pe: number;
  imageSize: number;
  subsystem: number;
  sections: { name: string; virtualSize: number; rva: number; rawSize: number; rawPtr: number }[];
  resource: { rva: number; size: number };
  reloc: { rva: number; size: number };
  certificate: { rva: number; size: number };
}
export interface RelocSummary {
  blocks: number;
  entries: number;
  digest: string;
}
export function parsePe(buf: Buffer): PeInfo;
export function relocations(buf: Buffer, info?: PeInfo): RelocSummary;
export function checkPe(
  buf: Buffer,
  reference?: Buffer,
): { ok: boolean; problems: string[]; subsystem: number; reloc: RelocSummary | null; sections: string[] };
