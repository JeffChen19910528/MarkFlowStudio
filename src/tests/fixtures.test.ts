import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EXPORTERS, EXPORT_FORMATS } from "../exporters";
import { validateDocx } from "../exporters/docx";
import { BUILTIN_THEMES } from "../themes/themes";

const sample = readFileSync(resolve(__dirname, "../../fixtures/sample.md"), "utf-8");

describe("every export format handles the full sample document", () => {
  it.each(EXPORT_FORMATS)("%s: non-empty output for every built-in theme and both styles", async (format) => {
    const exporter = EXPORTERS[format];
    for (const theme of BUILTIN_THEMES) {
      for (const style of ["print", "follow"] as const) {
        const input = { markdown: sample, title: "sample.md", theme, style };
        if (exporter.exportBinary) {
          const out = await exporter.exportBinary(input);
          expect(out.data.length).toBeGreaterThan(1000);
          await validateDocx(out.data);
        } else {
          const out = exporter.export!(input);
          expect(out.content.length).toBeGreaterThan(100);
          expect(out.content).toContain("繁體中文");
          expect(out.content).toContain("蘋果");
        }
      }
    }
  });

  it("the sample really contains the features the spec asks fixtures to cover", () => {
    for (const needle of ["繁體中文", "English", "😀", "    - 第三層", "| 名稱", "](./images/", "```ts", "& < >"]) {
      expect(sample, needle).toContain(needle);
    }
  });
});
