import { type KeyboardEvent, type ReactNode, useEffect, useRef } from "react";

interface ModalProps {
  labelledBy: string;
  onClose: () => void;
  /** Set false while an operation is running so Escape cannot dismiss the dialog. */
  closeOnEscape?: boolean;
  role?: "dialog" | "alertdialog";
  className?: string;
  children: ReactNode;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal: moves focus inside on open, keeps Tab within the dialog, closes on Escape,
 * and returns focus to the element that opened it.
 */
export function Modal({ labelledBy, onClose, closeOnEscape = true, role = "dialog", className = "", children }: ModalProps) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const el = box.current!;
    const initial = el.querySelector<HTMLElement>("[data-autofocus]") ?? el.querySelector<HTMLElement>(FOCUSABLE) ?? el;
    initial.focus();
    return () => {
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" && closeOnEscape) {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const items = [...box.current!.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (n) => !n.matches(":disabled") && !n.closest("[hidden]"),
    );
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || !box.current!.contains(document.activeElement))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="modal-backdrop">
      <div
        ref={box}
        className={`modal ${className}`.trim()}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
    </div>
  );
}
