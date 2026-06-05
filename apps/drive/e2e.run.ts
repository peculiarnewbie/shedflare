import * as Cloudflare from "alchemy/Cloudflare";
import * as Core from "alchemy/Test/Core";
import { loadShedflareConfig } from "@shedflare/alchemy";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import DriveStack from "./alchemy.run";

const stage =
  process.env.SHEDFLARE_DRIVE_E2E_STAGE ??
  `e2e-drive-${process.env.GITHUB_RUN_ID ?? process.env.CI_JOB_ID ?? Date.now()}`;
const authEmail =
  process.env.SHEDFLARE_DRIVE_E2E_AUTH_EMAIL ?? loadShedflareConfig().ownerEmail;
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

async function runBrowserFlow(base: string) {
  const headers = { "x-shedflare-e2e-token": authToken };
  const fileName = `shedflare-e2e-${Date.now()}.txt`;
  const fileBody = `Shedflare Drive E2E ${new Date().toISOString()}`;

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      baseURL: base,
      extraHTTPHeaders: headers,
    });
    try {
      const page = await context.newPage();

      await page.goto("/", { waitUntil: "networkidle" });
      await page.getByText(authEmail).waitFor({ timeout: 15_000 });

      await page.locator('input[name="file"]').setInputFiles({
        name: fileName,
        mimeType: "text/plain",
        buffer: Buffer.from(fileBody),
      });
      await page.getByText(fileName).waitFor({ timeout: 20_000 });

      const filesResponse = await context.request.get("/api/files?limit=30&offset=0");
      assert.equal(filesResponse.status(), 200);
      const filesBody = (await filesResponse.json()) as {
        files: Array<{ id: string; name: string }>;
      };
      const uploaded = filesBody.files.find((file) => file.name === fileName);
      assert.ok(uploaded, "uploaded file should be returned by /api/files");

      const downloadResponse = await context.request.get(`/api/files/${uploaded.id}/download`);
      assert.equal(downloadResponse.status(), 200);
      assert.equal(await downloadResponse.text(), fileBody);

      const publishResponse = await context.request.patch(`/api/files/${uploaded.id}`, {
        data: { isPublic: true },
      });
      assert.equal(publishResponse.status(), 200);

      const publicResponse = await fetch(`${base}/public/files/${uploaded.id}/download`);
      assert.equal(publicResponse.status, 200);
      assert.equal(await publicResponse.text(), fileBody);
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
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
    await runBrowserFlow(deployed.url);
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
