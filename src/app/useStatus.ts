import { useCallback, useState } from "react";
import { t } from "../i18n";
import { FileError } from "../shared/errors";
import type { Status } from "../shared/status";

/** The message shown in the banner under the toolbar, plus a helper that turns errors into messages. */
export function useStatus() {
  const [status, setStatus] = useState<Status | null>(null);

  const reportError = useCallback((e: unknown) => {
    const fe = e instanceof FileError ? e : null;
    setStatus({
      kind: "error",
      text: fe ? fe.message : t("common.unexpectedError"),
      detail: fe?.detail ?? (e instanceof Error ? e.message : undefined),
    });
  }, []);

  return { status, setStatus, reportError };
}
