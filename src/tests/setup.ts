import "@testing-library/jest-dom/vitest";

// Most tests assert on the Traditional Chinese text; language tests switch explicitly.
import { setLanguage } from "../i18n";
beforeEach(() => {
  try {
    localStorage.removeItem("markflow.language");
  } catch {
    /* no storage */
  }
  setLanguage("zh-TW", false);
});
