import { cloudflare } from "@cloudflare/vite-plugin";
import { antiSlopFmt, antiSlopLint } from "../tooling/anti-slop.vite.ts";
import solid from "vite-plugin-solid";

export default {
  plugins: [solid(), ...(process.env.VITEST ? [] : [cloudflare()])],
  server: {
    allowedHosts: true,
  },
  staged: {
    "*": "vp check --fix",
  },
  lint: {
    ...antiSlopLint("../tools/oxlint/anti-slop/index.ts"),
    options: { typeAware: true, typeCheck: true },
  },
  fmt: antiSlopFmt,
};
