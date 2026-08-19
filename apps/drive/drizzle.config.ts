import { defineConfig } from "drizzle-kit";

const isGenerate = process.argv.some((a) => a === "generate");

const config = {
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./src/migrations",
} satisfies Parameters<typeof defineConfig>[0];

if (!isGenerate) {
  Object.assign(config, {
    driver: "d1-http" as const,
    dbCredentials: {
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
      databaseId: process.env.DB_ID ?? "",
      token: process.env.CLOUDFLARE_D1_TOKEN ?? "",
    },
  });
}

export default defineConfig(config);
