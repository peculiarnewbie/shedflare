import * as Cloudflare from "alchemy/Cloudflare";
import * as Core from "alchemy/Test/Core";
import { loadShedflareConfig } from "@shedflare/alchemy";
import { execSync } from "node:child_process";
import { join } from "node:path";
import DriveStack from "./alchemy.run";

const driveRoot = process.cwd();
const repoRoot = join(driveRoot, "../..");
process.chdir(repoRoot);

const stage =
  process.env.SHEDFLARE_DRIVE_E2E_STAGE ??
  `e2e-drive-${process.env.GITHUB_RUN_ID ?? process.env.CI_JOB_ID ?? Date.now()}`;
const authEmail = process.env.SHEDFLARE_DRIVE_E2E_AUTH_EMAIL ?? loadShedflareConfig().ownerEmail;
const authToken = process.env.SHEDFLARE_DRIVE_E2E_AUTH_TOKEN ?? crypto.randomUUID();

process.env.SHEDFLARE_DRIVE_E2E_AUTH_EMAIL = authEmail;
process.env.SHEDFLARE_DRIVE_E2E_AUTH_TOKEN = authToken;

const options = {
  providers: Cloudflare.providers(),
  state: Cloudflare.state(),
};

async function deployDrive() {
  return await Core.run(Core.deploy(options, DriveStack, { stage }), options);
}

async function destroyDrive() {
  await Core.run(Core.destroy(options, DriveStack, { stage }), options);
}

function runPlaywright(baseUrl: string) {
  const extraArgs = process.argv
    .slice(2)
    .filter((a) => a !== "--destroy-only" && a !== "--")
    .join(" ");
  execSync(`npx playwright test ${extraArgs}`, {
    cwd: driveRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      BASE_URL: baseUrl,
      E2E_AUTH_EMAIL: authEmail,
      E2E_AUTH_TOKEN: authToken,
    },
  });
}

async function main() {
  if (process.argv.includes("--destroy-only")) {
    console.log(`Destroying drive E2E stage ${stage}`);
    await destroyDrive();
    return;
  }

  console.log(`Deploying drive E2E stage ${stage}`);
  let deployed: Awaited<ReturnType<typeof deployDrive>> | null = null;
  try {
    deployed = await deployDrive();
    console.log(`Testing ${deployed.url}`);
    runPlaywright(deployed.url ?? deployed.configuredUrl);
    console.log("Drive E2E passed");
  } finally {
    console.log(`Destroying drive E2E stage ${stage}`);
    await destroyDrive();
  }
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
