import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { object, record, safeParse, string, unknown } from "valibot";
import {
  APP_IDS,
  CatalogValidationError,
  CoreError,
  computeDeployOrder,
  createManifestCatalog,
  discoverManifestDirectory,
  discoverManifests,
  loadManifest,
  loadManifestFile,
  parseManifest,
} from "../src/index.ts";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "shedflare-core-"));
  temporaryRoots.push(root);
  mkdirSync(join(root, "apps"));
  return root;
}

function manifest(id: string, dependsOn: readonly string[] = []): string {
  return JSON.stringify(
    {
      id,
      name: `Shedflare ${id}`,
      description: `Description for ${id}`,
      lifecycle: "experimental",
      category: "productivity",
      dataSensitivity: "personal",
      dependsOn,
      defaultSubdomain: id,
      vars: {},
      secrets: {},
      resources: [],
    },
    null,
    2,
  );
}

function writeManifest(root: string, directory: string, contents: string): void {
  const appDir = join(root, "apps", directory);
  mkdirSync(appDir, { recursive: true });
  writeFileSync(join(appDir, "shedflare.app.jsonc"), contents);
}

describe("current app catalog", () => {
  test("discovers every manifest and matches the generated registry", () => {
    const root = join(import.meta.dirname, "../../..");
    const catalog = discoverManifests(root);

    expect(catalog.appIds).toEqual([...APP_IDS]);
    expect(catalog.manifests.get("auth")).toMatchObject({
      lifecycle: "beta",
      category: "platform",
      dataSensitivity: "high",
    });
  });

  test("accepts computed variables and legacy resource descriptor variations", () => {
    const root = join(import.meta.dirname, "../../..");
    const auth = loadManifest(root, "auth");
    const money = loadManifest(root, "money");

    expect(auth.vars.ALLOWED_CLIENTS?.from).toBe("computed");
    expect(money.resources).toContainEqual({ type: "d1", binding: "MONEY_DB" });
  });

  test("orders dependencies before selected apps", () => {
    const root = join(import.meta.dirname, "../../..");
    const catalog = discoverManifests(root);

    expect(computeDeployOrder(["chat", "drive"], catalog)).toEqual(["auth", "chat", "drive"]);
  });
});

describe("manifest validation", () => {
  test("parses and catalogs manifests without a repository filesystem", () => {
    const auth = parseManifest(JSON.parse(manifest("auth")), "inline:auth");
    const drive = parseManifest(JSON.parse(manifest("drive", ["auth"])), "inline:drive");
    const catalog = createManifestCatalog([
      { manifest: drive, source: "inline:drive" },
      { manifest: auth, source: "inline:auth" },
    ]);

    expect(catalog.appIds).toEqual(["auth", "drive"]);
    expect(computeDeployOrder(["drive"], catalog)).toEqual(["auth", "drive"]);
  });

  test("loads an explicit manifest file and discovers an explicit apps directory", () => {
    const root = temporaryRoot();
    writeManifest(root, "standalone", manifest("standalone"));
    const filePath = join(root, "apps", "standalone", "shedflare.app.jsonc");

    expect(loadManifestFile(filePath).id).toBe("standalone");
    expect(discoverManifestDirectory(join(root, "apps")).appIds).toEqual(["standalone"]);
  });

  test("reports JSONC parse locations", () => {
    const root = temporaryRoot();
    writeManifest(root, "broken", '{ "id": "broken",');

    expect(() => discoverManifests(root)).toThrow(CatalogValidationError);
    try {
      discoverManifests(root);
    } catch (error) {
      expect(error).toBeInstanceOf(CatalogValidationError);
      if (error instanceof CatalogValidationError) {
        expect(error.errors[0]).toMatchObject({
          code: "MANIFEST_INVALID",
          details: { filePath: expect.stringContaining("shedflare.app.jsonc"), line: 1 },
        });
      }
    }
  });

  test("reports directory mismatches, missing dependencies, and dependency cycles together", () => {
    const root = temporaryRoot();
    writeManifest(root, "first", manifest("second", ["missing"]));
    writeManifest(root, "cycle-a", manifest("cycle-a", ["cycle-b"]));
    writeManifest(root, "cycle-b", manifest("cycle-b", ["cycle-a"]));

    try {
      discoverManifests(root);
      throw new Error("Expected manifest discovery to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(CatalogValidationError);
      if (error instanceof CatalogValidationError) {
        expect(error.errors.map((item) => item.code)).toEqual(
          expect.arrayContaining([
            "MANIFEST_ID_MISMATCH",
            "MANIFEST_DEPENDENCY_MISSING",
            "MANIFEST_DEPENDENCY_CYCLE",
          ]),
        );
      }
    }
  });

  test("rejects an invalid field with its field path", () => {
    const root = temporaryRoot();
    writeManifest(root, "bad", manifest("bad").replace('"experimental"', '"stable"'));

    try {
      loadManifest(root, "bad");
      throw new Error("Expected manifest loading to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(CoreError);
      if (error instanceof CoreError) {
        expect(error.code).toBe("MANIFEST_INVALID");
        expect(error.details.fieldPath).toBe("lifecycle");
      }
    }
  });

  test("emits the committed editor-facing schema", () => {
    const root = join(import.meta.dirname, "../../..");
    const schemaResult = safeParse(
      object({ $id: string(), properties: record(string(), unknown()) }),
      JSON.parse(
        readFileSync(
          join(root, "packages/shedflare-core/schemas/app-manifest.schema.json"),
          "utf8",
        ),
      ),
    );
    if (!schemaResult.success) throw new Error("Generated app manifest schema is invalid");
    const schema = schemaResult.output;

    expect(schema.$id).toBe("https://shedflare.dev/schemas/app-manifest.schema.json");
    expect(schema.properties).toHaveProperty("lifecycle");
    expect(schema.properties).toHaveProperty("dataSensitivity");
  });
});
