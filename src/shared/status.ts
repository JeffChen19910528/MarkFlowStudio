export interface Status {
  kind: "info" | "error" | "success";
  text: string;
  detail?: string;
}

/** Where flows report progress and failures, without knowing how they are displayed. */
export interface StatusSink {
  setStatus(status: Status | null): void;
  reportError(error: unknown): void;
}
