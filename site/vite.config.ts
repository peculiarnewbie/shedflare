import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite-plus";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid(), ...(process.env.VITEST ? [] : [cloudflare()])],
  server: {
    allowedHosts: true,
  },
  staged: {
    "*": "vp check --fix",
  },
  lint: { options: { typeAware: true, typeCheck: true } },
});
