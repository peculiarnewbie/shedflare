import { antiSlopFmt, antiSlopLint } from "../../tooling/anti-slop.vite.ts";
import { cloudflare } from "@cloudflare/vite-plugin";
import solid from "vite-plugin-solid";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildInfoDefines } from "./build/vite-build-info.ts";

const repoDir = path.dirname(fileURLToPath(import.meta.url));

export default {
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
    include: ["src/**/*.test.{ts,tsx}", "deploy/**/*.test.ts"],
  },
  staged: {
    "*": "vp check --fix",
  },
  lint: {
    ...antiSlopLint("../../tools/oxlint/anti-slop/index.ts"),
    options: { typeAware: true, typeCheck: true },
  },
  fmt: antiSlopFmt,
};
