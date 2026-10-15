/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // The app is bundled for browsers (package.json "browser" field), which is the build that accepts
    // `arrayBuffer`. Point tests at the same build instead of the Node entry.
    alias: process.env.VITEST ? { mammoth: "mammoth/mammoth.browser.js" } : {},
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/tests/setup.ts"],
    // Process CSS so `?raw` imports (used by the HTML exporter) are real, not stubbed to "".
    css: { include: /.+/ },
  },
});
