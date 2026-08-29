import { antiSlopFmt, antiSlopLint } from "../../tooling/anti-slop.vite.ts";
import { cloudflare } from "@cloudflare/vite-plugin";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoDir = path.dirname(fileURLToPath(import.meta.url));

export default {
  resolve: {
    alias: {
      "#": path.resolve(repoDir, "src"),
    },
  },
  plugins: [cloudflare()],
  test: {
    include: ["src/**/*.test.ts"],
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
