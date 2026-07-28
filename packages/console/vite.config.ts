import { defineConfig } from "vite-plus";
import type { Plugin } from "vite";
import solid from "vite-plugin-solid";
import { consoleApiPlugin } from "./src/server/vite-plugin.ts";

const port = Number(process.env.CONSOLE_PORT ?? 5174);

export default defineConfig({
  // vite-plugin-solid and Vite+ expose structurally equivalent Plugin types from
  // separate package instances. Bridge that package boundary here.
  plugins: [solid() as unknown as Plugin[], consoleApiPlugin()],
  server: {
    port,
    strictPort: true,
    allowedHosts: ["cachy"],
  },
  staged: {
    "*": "vp check --fix",
  },
  lint: { options: { typeAware: true, typeCheck: true } },
});
