import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { toJsonSchema } from "@valibot/to-json-schema";
import { ShedflareConfigV2Schema } from "../src/config/schema.ts";
import { AppManifestSchema } from "../src/manifests/schema.ts";
import { findRepoRoot } from "../src/paths.ts";

const root = findRepoRoot(process.cwd());
const schemasDir = join(root, "packages", "shedflare-core", "schemas");
mkdirSync(schemasDir, { recursive: true });

const schema = {
  ...toJsonSchema(AppManifestSchema, { target: "draft-2020-12" }),
  $id: "https://shedflare.dev/schemas/app-manifest.schema.json",
  title: "Shedflare app manifest",
};

function schemaText(value: object): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

const schemas = new Map<string, string>([
  ["app-manifest.schema.json", schemaText(schema)],
  [
    "shedflare-config.schema.json",
    schemaText({
      ...toJsonSchema(ShedflareConfigV2Schema, { target: "draft-2020-12" }),
      $id: "https://shedflare.dev/schemas/shedflare-config.schema.json",
      title: "Shedflare config version 2",
    }),
  ],
]);

if (process.argv.includes("--check")) {
  for (const [name, content] of schemas) {
    const path = join(schemasDir, name);
    if (!existsSync(path) || readFileSync(path, "utf8") !== content) {
      throw new Error(`Generated schema ${name} is out of date. Run \`pnpm schemas:generate\`.`);
    }
  }
} else {
  for (const [name, content] of schemas) writeFileSync(join(schemasDir, name), content);
}
