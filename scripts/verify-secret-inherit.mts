import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const ACCOUNT_ID = "3a855f7ef3ac127682a419eddeb9f884";
const STAGE = "sec-verify";
const STACK = "scripts/secret-inherit-verify/alchemy.run.ts";

interface CfOAuth {
  access: string;
}

function loadAccessToken(): string {
  const path = join(homedir(), ".alchemy/credentials/default/cf-oauth.json");
  const parsed = JSON.parse(readFileSync(path, "utf8")) as CfOAuth;
  if (!parsed.access)
    throw new Error("Missing Cloudflare OAuth access token in alchemy credentials");
  return parsed.access;
}

async function cf<T>(path: string): Promise<T> {
  const token = loadAccessToken();
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await response.json()) as { success: boolean; result: T; errors?: unknown[] };
  if (!response.ok || !body.success) {
    throw new Error(`Cloudflare API ${path} failed: ${JSON.stringify(body.errors ?? body)}`);
  }
  return body.result;
}

async function listSecretNames(workerName: string): Promise<string[]> {
  const secrets = await cf<Array<{ name: string }>>(
    `/accounts/${ACCOUNT_ID}/workers/scripts/${workerName}/secrets`,
  );
  return secrets.map((s) => s.name).sort();
}

async function listBindingNames(workerName: string): Promise<string[]> {
  const settings = await cf<{ bindings?: Array<{ name: string; type: string }> }>(
    `/accounts/${ACCOUNT_ID}/workers/scripts/${workerName}/settings`,
  );
  return (settings.bindings ?? [])
    .filter((b) => b.type === "secret_text" || b.type === "secret_key")
    .map((b) => b.name)
    .sort();
}

async function probeWorker(url: string): Promise<{ hasSecret: boolean; plain: string | null }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Worker probe failed: ${response.status}`);
  return (await response.json()) as { hasSecret: boolean; plain: string | null };
}

async function deploy(includeSecret: boolean): Promise<{ workerName: string; url?: string }> {
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    ALCHEMY_STAGE: STAGE,
    SHEDFLARE_DOMAIN: "example.com",
    OWNER_EMAIL: "verify@example.com",
    SHEDFLARE_VERIFY_INCLUDE_SECRET: includeSecret ? "1" : "0",
  };
  if (includeSecret) {
    env.TEST_SECRET = "shedflare-pattern-b-verify-secret";
  }

  const stdout = await new Promise<string>((resolve, reject) => {
    const child = spawn("vp", ["exec", "alchemy", "deploy", STACK, "--yes"], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (chunk) => {
      out += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      out += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`alchemy deploy failed (${code}):\n${out}`));
    });
  });

  const match = stdout.match(/workerName: '([^']+)'/);
  const urlMatch = stdout.match(/url: '([^']+)'/);
  if (!match) throw new Error(`Could not parse workerName from deploy output:\n${stdout}`);
  return { workerName: match[1], url: urlMatch?.[1] };
}

function printStep(title: string, data: unknown) {
  console.log(`\n=== ${title} ===`);
  console.log(typeof data === "string" ? data : JSON.stringify(data, null, 2));
}

async function main() {
  printStep("Step 1", "Deploy WITH TEST_SECRET in env");
  const first = await deploy(true);
  printStep("Worker", first);

  const secretsAfterFirst = await listSecretNames(first.workerName);
  const bindingsAfterFirst = await listBindingNames(first.workerName);
  printStep("Secret names after deploy #1", secretsAfterFirst);
  printStep("Secret bindings after deploy #1", bindingsAfterFirst);

  if (!first.url) throw new Error("Missing workers.dev URL from first deploy");
  const probeAfterFirst = await probeWorker(first.url);
  printStep("Runtime probe after deploy #1", probeAfterFirst);

  printStep("Step 2", "Deploy WITHOUT TEST_SECRET in env (omit from env block)");
  const second = await deploy(false);
  printStep("Worker", second);

  const secretsAfterSecond = await listSecretNames(second.workerName);
  const bindingsAfterSecond = await listBindingNames(second.workerName);
  printStep("Secret names after deploy #2", secretsAfterSecond);
  printStep("Secret bindings after deploy #2", bindingsAfterSecond);

  if (!second.url) throw new Error("Missing workers.dev URL from second deploy");
  const probeAfterSecond = await probeWorker(second.url);
  printStep("Runtime probe after deploy #2", probeAfterSecond);

  const secretSurvived =
    secretsAfterSecond.includes("TEST_SECRET") || bindingsAfterSecond.includes("TEST_SECRET");
  const runtimeWorks = probeAfterSecond.hasSecret === true;

  printStep("Verdict", {
    secretSurvivedOnCloudflare: secretSurvived,
    runtimeStillHasSecret: runtimeWorks,
    patternBWorks: secretSurvived && runtimeWorks,
  });

  if (!secretSurvived || !runtimeWorks) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
