import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { loadDotEnvFile, parseDotEnv } from "./dotenv";
import { physicalWorkerName, resolveDeployStage } from "./env";

const originalStage = process.env.ALCHEMY_STAGE;
const originalToken = process.env.CF_API_TOKEN;
const originalAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;

afterEach(() => {
  if (originalStage === undefined) {
    delete process.env.ALCHEMY_STAGE;
  } else {
    process.env.ALCHEMY_STAGE = originalStage;
  }

  if (originalToken === undefined) {
    delete process.env.CF_API_TOKEN;
  } else {
    process.env.CF_API_TOKEN = originalToken;
  }

  if (originalAccountId === undefined) {
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
  } else {
    process.env.CLOUDFLARE_ACCOUNT_ID = originalAccountId;
  }
});

describe("dotenv loading", () => {
  test("parses common .env syntax", () => {
    expect(
      parseDotEnv(`
        # ignored
        CF_API_TOKEN=token-123
        export CLOUDFLARE_ACCOUNT_ID="account\\n123"
        SINGLE_QUOTED='literal # value'
        TRAILING_COMMENT=value # comment
      `),
    ).toEqual({
      CF_API_TOKEN: "token-123",
      CLOUDFLARE_ACCOUNT_ID: "account\n123",
      SINGLE_QUOTED: "literal # value",
      TRAILING_COMMENT: "value",
    });
  });

  test("loads values without overriding exported environment", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "shedflare-console-env-"));
    const file = path.join(dir, ".env");
    try {
      process.env.CF_API_TOKEN = "exported-token";
      delete process.env.CLOUDFLARE_ACCOUNT_ID;
      writeFileSync(file, "CF_API_TOKEN=file-token\nCLOUDFLARE_ACCOUNT_ID=file-account\n");

      loadDotEnvFile(file);

      expect(process.env.CF_API_TOKEN).toBe("exported-token");
      expect(process.env.CLOUDFLARE_ACCOUNT_ID).toBe("file-account");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("deploy stage helpers", () => {
  test("default to the production stage", () => {
    delete process.env.ALCHEMY_STAGE;

    expect(resolveDeployStage()).toBe("prod");
    expect(physicalWorkerName("chat")).toBe("shedflare-prod-chat");
  });

  test("allow explicit temporary stages", () => {
    process.env.ALCHEMY_STAGE = "dev-bolt";

    expect(resolveDeployStage()).toBe("dev-bolt");
    expect(physicalWorkerName("chat")).toBe("shedflare-dev-bolt-chat");
  });
});
