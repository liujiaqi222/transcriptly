import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const extensionRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": extensionRoot,
    },
  },
  test: {
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
