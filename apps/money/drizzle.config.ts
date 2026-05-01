import { defineConfig } from "drizzle-kit";

const isGenerate = process.argv.some((a) => a === "generate");

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./src/migrations",
  casing: "snake_case",
  ...(isGenerate
    ? {}
    : {
        driver: "d1-http",
        dbCredentials: {
          accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
          databaseId: process.env.DB_ID ?? "",
          token: process.env.CLOUDFLARE_D1_TOKEN ?? "",
        },
      }),
});
