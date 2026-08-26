import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["*.test.ts", "src/**/*.test.ts", "src/**/*.test.tsx", "app/**/*.test.ts", "app/**/*.test.tsx"],
  },
});
