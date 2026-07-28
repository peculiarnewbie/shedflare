import { defineConfig } from "vite-plus";
import { cloudflare } from "@cloudflare/vite-plugin";
import solid from "vite-plugin-solid";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildInfoDefines } from "../../infra/vite-build-info";

const repoDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "#": path.resolve(repoDir, "src"),
    },
  },
  define: buildInfoDefines(import.meta.url),
  plugins: [solid(), ...(process.env.VITEST ? [] : [cloudflare()])],
  server: {
    allowedHosts: true,
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/solid-js") || id.includes("node_modules/@solidjs")) {
            return "vendor";
          }
          if (
            id.includes("node_modules/marked") ||
            id.includes("node_modules/dompurify") ||
            id.includes("node_modules/highlight.js")
          ) {
            return "markdown";
          }
          if (id.includes("node_modules/effect")) {
            return "effect";
          }
        },
      },
    },
  },
  staged: {
    "*": "vp check --fix",
  },
  lint: { options: { typeAware: true, typeCheck: true } },
});
