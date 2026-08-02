import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "workers-vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "#": new URL("./src", import.meta.url).pathname,
      vitest: "workers-vitest",
    },
  },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.test.jsonc" },
    }),
  ],
  test: {
    include: ["test/workers/**/*.test.ts"],
  },
});
