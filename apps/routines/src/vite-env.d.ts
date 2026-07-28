interface ImportMetaEnv extends Record<string, string | undefined> {
  readonly VITE_APP_CONFIG?: unknown;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
/// <reference types="@cloudflare/workers-types" />
