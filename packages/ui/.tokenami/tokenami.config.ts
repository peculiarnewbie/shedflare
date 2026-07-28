import { createConfig } from "@tokenami/css";
import { shedflareThemeOptions } from "../src/theme/index.ts";

export default createConfig({
  ...shedflareThemeOptions,
  include: ["./src/**/*.{ts,tsx}"],
} as unknown as Parameters<typeof createConfig>[0]);
