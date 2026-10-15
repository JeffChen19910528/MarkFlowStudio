import { t } from "../i18n";

const CLEANUP_FALLBACK_MS = 5 * 60 * 1000;

/**
 * Open the browser print dialog for a complete HTML document, via a hidden same-origin iframe.
 * The user then picks "Save as PDF". We cannot observe whether they actually saved a file;
 * the promise resolves once the dialog has been requested.
 */
export function printHtml(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.title = t("pdf.printTitle");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";

    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      frame.remove();
    };

    frame.addEventListener(
      "load",
      () => {
        const win = frame.contentWindow;
        if (!win) {
          cleanup();
          reject(new Error(t("pdf.printFailed")));
          return;
        }
        try {
          win.addEventListener("afterprint", cleanup, { once: true });
          timer = setTimeout(cleanup, CLEANUP_FALLBACK_MS);
          win.focus();
          win.print();
          resolve();
        } catch (e) {
          cleanup();
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      },
      { once: true },
    );

    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}
