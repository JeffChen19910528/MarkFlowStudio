import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { Modal } from "../components/Modal";
import { contrastRatio } from "../themes/themes";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function Harness({ closeOnEscape = true }: { closeOnEscape?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>開啟</button>
      {open && (
        <Modal labelledBy="t" onClose={() => setOpen(false)} closeOnEscape={closeOnEscape}>
          <h2 id="t">標題</h2>
          <button>甲</button>
          <button data-autofocus>乙</button>
          <button disabled>停用</button>
          <button>丙</button>
        </Modal>
      )}
    </>
  );
}

const key = (el: Element, k: string, shiftKey = false) => fireEvent.keyDown(el, { key: k, shiftKey });

describe("Modal focus management", () => {
  it("moves focus to the [data-autofocus] element when opened", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "開啟" }));
    expect(screen.getByRole("button", { name: "乙" })).toHaveFocus();
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("dialog", { name: "標題" })).toBeInTheDocument();
  });

  it("keeps Tab inside the dialog, wrapping at both ends and skipping disabled controls", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "開啟" }));
    const [a, , c] = ["甲", "乙", "丙"].map((n) => screen.getByRole("button", { name: n }));
    c.focus();
    key(c, "Tab");
    expect(a).toHaveFocus(); // last → first (the disabled button is never a stop)
    key(a, "Tab", true);
    expect(c).toHaveFocus(); // first → last
  });

  it("closes on Escape and returns focus to the opener", () => {
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "開啟" });
    opener.focus();
    fireEvent.click(opener);
    key(screen.getByRole("dialog"), "Escape");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("ignores Escape while an operation is running", () => {
    render(<Harness closeOnEscape={false} />);
    fireEvent.click(screen.getByRole("button", { name: "開啟" }));
    key(screen.getByRole("dialog"), "Escape");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("UI colour contrast (WCAG AA, 4.5:1 for text)", () => {
  const css = readFileSync(resolve(__dirname, "../styles.css"), "utf-8");
  const v = (name: string) => new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css)![1];
  const pairs: [string, string, string][] = [
    ["body text on page", v("--fg"), v("--bg")],
    ["body text on toolbar/status bar", v("--fg"), v("--bar")],
    ["muted text on toolbar/status bar", v("--muted"), v("--bar")],
    ["muted text on page", v("--muted"), v("--bg")],
    ["primary button text", "#ffffff", v("--accent")],
    ["warning text", "#8a4b00", "#fff3cd"],
    ["error banner text", "#82071e", "#ffebe9"],
    ["info banner text", v("--fg"), "#ddf4ff"],
    ["success banner text", v("--fg"), "#dafbe1"],
  ];
  it.each(pairs)("%s", (_name, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});
