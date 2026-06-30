import { stdout as output } from "node:process";
import { openSync, readSync, closeSync } from "node:fs";
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

async function readSecret(prompt: string): Promise<string> {
  output.write(prompt);
  const tty = openSync("/dev/tty", "r");
  let value = "";
  const buf = Buffer.alloc(1);
  try {
    for (;;) {
      const bytesRead = readSync(tty, buf, 0, 1, null);
      if (bytesRead === 0) break;
      const ch = buf[0];
      if (ch === 0x0a || ch === 0x0d) break; // newline / carriage return
      if (ch === 0x7f || ch === 0x08) {
        // backspace / delete
        if (value.length > 0) {
          value = value.slice(0, -1);
          output.write("\b \b");
        }
      } else if (ch >= 0x20) {
        value += String.fromCharCode(ch);
        output.write("*");
      }
    }
  } finally {
    closeSync(tty);
  }
  output.write("\n");
  return value.trim();
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
    value = await readSecret(`Value for ${options.name}: `);
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
    console.warn(
      "[shedflare] --secret=NAME=value is deprecated and exposes secrets in shell history and process listings. Use environment variables instead (e.g. SECRET_NAME=value pnpm deploy).",
    );
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

  for (const { appId, names } of missing) {
    for (const name of names) {
      const answer = await readSecret(`${appId}: ${name}: `);
      if (!answer) {
        throw new Error(`Missing required secret ${name} for ${appId}`);
      }
      values[name] = answer;
    }
  }

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
