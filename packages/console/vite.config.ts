import { defineConfig } from "vite-plus";
import type { Plugin } from "vite";
import solid from "vite-plugin-solid";
import { consoleApiPlugin } from "./src/server/vite-plugin.ts";

const port = Number(process.env.CONSOLE_PORT ?? 5174);

function vitePlugin<PluginValue>(plugin: PluginValue): Plugin[] {
  // SAFETY: vite-plugin-solid and Vite+ install structurally equivalent Vite Plugin types from
  // separate package instances; Vite consumes this plugin through their shared runtime contract.
  return [plugin as Plugin];
}

export default defineConfig({
  plugins: [...vitePlugin(solid()), consoleApiPlugin()],
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
