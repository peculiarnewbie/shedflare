import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { APP_IDS, loadManifest, type AppId } from "../core/manifests.js";
import { assertEnabledApp, physicalWorkerName } from "../core/worker-names.js";
import * as wrangler from "../core/wrangler.js";

export interface SecretSetOptions {
  app: string;
  name: string;
  value?: string;
}

export interface SecretListOptions {
  app: string;
}

export async function secretSetCommand(options: SecretSetOptions): Promise<void> {
  if (!(APP_IDS as readonly string[]).includes(options.app)) {
    console.error(`Unknown app: ${options.app}`);
    process.exit(1);
  }

  try {
    assertEnabledApp(options.app);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const manifest = loadManifest(options.app as AppId);
  if (!manifest.secrets[options.name]) {
    console.error(
      `Secret "${options.name}" is not declared in apps/${options.app}/shedflare.app.jsonc`,
    );
    process.exit(1);
  }

  let value = options.value;
  if (!value) {
    const rl = createInterface({ input, output });
    value = await rl.question(`Value for ${options.name}: `);
    rl.close();
  }

  if (!value) {
    console.error("Secret value is required.");
    process.exit(1);
  }

  const workerName = physicalWorkerName(options.app);
  await wrangler.putSecret(options.name, value, { workerName });
  console.log(`Set ${options.name} on worker ${workerName}`);
}

export async function secretListCommand(options: SecretListOptions): Promise<void> {
  if (!(APP_IDS as readonly string[]).includes(options.app)) {
    console.error(`Unknown app: ${options.app}`);
    process.exit(1);
  }

  try {
    assertEnabledApp(options.app);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const manifest = loadManifest(options.app as AppId);
  const workerName = physicalWorkerName(options.app);
  const setOnWorker = await wrangler.listSecrets({ workerName });

  console.log(`Worker: ${workerName}\n`);
  for (const [name, def] of Object.entries(manifest.secrets)) {
    const present = setOnWorker.includes(name);
    const status = present ? "set" : def.required ? "missing (required)" : "missing (optional)";
    console.log(`  ${name}: ${status}`);
  }
}

/** Parse --secret NAME=VALUE flags for deploy. */
export function parseSecretFlags(argv: string[]): Record<string, string> {
  const secrets: Record<string, string> = {};
  for (const arg of argv) {
    if (!arg.startsWith("--secret=")) continue;
    const pair = arg.slice("--secret=".length);
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    secrets[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return secrets;
}

export async function promptMissingSecrets(
  missing: Array<{ appId: string; names: string[] }>,
): Promise<Record<string, string>> {
  const values: Record<string, string> = {};
  const rl = createInterface({ input, output });

  for (const { appId, names } of missing) {
    for (const name of names) {
      const answer = await rl.question(`${appId}: ${name}: `);
      if (!answer) {
        rl.close();
        throw new Error(`Missing required secret ${name} for ${appId}`);
      }
      values[name] = answer;
    }
  }

  rl.close();
  return values;
}

export function applySecretsToEnv(secrets: Record<string, string>): void {
  for (const [name, value] of Object.entries(secrets)) {
    process.env[name] = value;
  }
}

export function clearSecretsFromEnv(names: string[]): void {
  for (const name of names) {
    delete process.env[name];
  }
}
