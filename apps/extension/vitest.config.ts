import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const extensionRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  define: {
    __WEB_ORIGIN__: JSON.stringify("http://localhost:3000"),
  },
  resolve: {
    alias: {
      "@": extensionRoot,
    },
  },
  test: {
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
