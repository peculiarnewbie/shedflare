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
  staged: {
    "*": "vp check --fix",
  },
  lint: { options: { typeAware: true, typeCheck: true } },
});
