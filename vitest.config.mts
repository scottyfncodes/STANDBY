import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(path.dirname(new URL(import.meta.url).pathname), "src") } },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
