import { antiSlopFmt, antiSlopLint } from "../../tooling/anti-slop.vite.ts";

export default {
  test: {
    environment: "node",
    include: ["*.test.ts"],
    exclude: ["alchemy.test.ts"],
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
