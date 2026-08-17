import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "wxt";

const extensionRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  manifest: {
    name: "Transcriptly",
    description: "Capture YouTube transcripts to local Markdown.",
    key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2oKt6WgycyPtw7+lRf8zD1SK/AYBZzgwAnZsxIjvacxrWTWLm9xLjfOgdZ3iyPRq2Eg4DiGOvHKk/Rn39gRpU1EYlvTVOp+PLkhV5z/N3l8+ptv4jetOr5sE8tFBCFRRGkLOXsVgjl+V/ia+y+hpgWZ+In5kFs+dBpr+hDOsj1klKxvAh57fGbZE03U3etiY5x7hy4eIGFM1hj2BZIH3Zxb+qUGOQcT7jevpEGdJAPRA5RlGLG5v/7w1JjjOjWAiTKUVnaePjR+iVeNv+yvOrJq3u/vOxaCHQ43eeWGZClopVUqgle2I5PAmR4pJlaeXUE8ls3XBgt4wWa9e50Tc7wIDAQAB",
  },
  vite: () => ({
    plugins: [react()],
    resolve: {
      alias: {
        "@": extensionRoot,
      },
    },
  }),
});
