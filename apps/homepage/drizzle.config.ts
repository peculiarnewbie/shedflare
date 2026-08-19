import { defineConfig } from "drizzle-kit";

const isGenerate = process.argv.some((a) => a === "generate");

const baseConfig = {
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./src/migrations",
} as const;

export default defineConfig(
  isGenerate
    ? baseConfig
    : {
        ...baseConfig,
        driver: "d1-http",
        dbCredentials: {
          accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
          databaseId: process.env.DB_ID ?? "",
          token: process.env.CLOUDFLARE_D1_TOKEN ?? "",
        },
      },
);
