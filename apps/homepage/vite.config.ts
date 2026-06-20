import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite-plus";
import solid from "vite-plugin-solid";
import { buildInfoDefines } from "../../infra/vite-build-info";

export default defineConfig({
  define: buildInfoDefines(import.meta.url),
  plugins: [solid(), ...(process.env.VITEST ? [] : [cloudflare()])],
  server: {
    allowedHosts: true,
  },
  staged: {
    "*": "vp check --fix",
  },
  lint: { options: { typeAware: true, typeCheck: true } },
});
