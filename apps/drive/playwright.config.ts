import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 1,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:8787",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    ...(process.env.E2E_AUTH_TOKEN && {
      extraHTTPHeaders: {
        "x-shedflare-e2e-token": process.env.E2E_AUTH_TOKEN,
      },
    }),
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
