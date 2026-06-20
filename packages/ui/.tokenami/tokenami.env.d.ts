import type config from "./tokenami.config.ts";

type ShedflareTokenamiConfig = typeof config;

declare module "tokenami" {
  interface TokenamiConfig extends ShedflareTokenamiConfig {}
}

/// <reference types="@tokenami/css" />
