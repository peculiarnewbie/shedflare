import { cloudflare } from "@cloudflare/vite-plugin";
import { antiSlopFmt, antiSlopLint } from "../../tooling/anti-slop.vite.ts";
import solid from "vite-plugin-solid";
import { buildInfoDefines } from "./build/vite-build-info.ts";

export default {
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
  lint: {
    ...antiSlopLint("../../tools/oxlint/anti-slop/index.ts"),
    options: { typeAware: true, typeCheck: true },
  },
  fmt: antiSlopFmt,
};
