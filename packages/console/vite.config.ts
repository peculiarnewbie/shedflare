import { defineConfig } from "vite-plus";
import solid from "vite-plugin-solid";
import { consoleApiPlugin } from "./src/server/vite-plugin.ts";

const port = Number(process.env.CONSOLE_PORT ?? 5174);

export default defineConfig({
  plugins: [solid(), consoleApiPlugin()],
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
