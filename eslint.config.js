import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "release", "build", "src-tauri"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  { files: ["*.js", "*.ts"], languageOptions: { globals: { ...globals.node } } },
  {
    // CommonJS launcher (it is embedded in a Node single-executable application).
    files: ["scripts/**/*.cjs"],
    languageOptions: { sourceType: "commonjs", globals: { ...globals.node } },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    // Node 22 scripts: fetch/WebSocket are Node globals there.
    files: ["scripts/**/*.mjs"],
    languageOptions: { globals: { ...globals.node, fetch: "readonly", WebSocket: "readonly" } },
  },
);
