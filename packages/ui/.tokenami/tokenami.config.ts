import { createConfig } from "@tokenami/css";
import { shedflareThemeOptions } from "../src/theme/index.ts";

const config = {
  ...shedflareThemeOptions,
  include: ["./src/**/*.{ts,tsx}"],
};

function tokenamiConfig<ConfigValue>(value: ConfigValue): Parameters<typeof createConfig>[0] {
  // SAFETY: Tokenami's self-referential theme generic cannot represent a reusable theme object;
  // createConfig validates and infers the concrete theme keys when it consumes this static value.
  return value as Parameters<typeof createConfig>[0];
}

// SAFETY: this static local config is consumed by Tokenami itself; its generic theme type cannot
// represent a reusable theme object before createConfig performs its theme-key inference.
export default createConfig(tokenamiConfig(config));
