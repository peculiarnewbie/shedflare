import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const repositories = [
  "packages",
  "anki",
  "auth",
  "cf-bill",
  "chat",
  "discord",
  "drive",
  "homepage",
  "links",
  "money",
  "observability",
  "routines",
  "site",
];

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("creates the complete sibling contributor workspace", () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "shedflare-contributor-setup-"));

  try {
    const workspaceRoot = join(temporaryRoot, "shedflare");
    const suiteRoot = join(workspaceRoot, "suite");
    const remotesRoot = join(temporaryRoot, "remotes");
    mkdirSync(join(suiteRoot, "scripts"), { recursive: true });
    mkdirSync(join(suiteRoot, "templates", "contributor-workspace"), { recursive: true });
    mkdirSync(remotesRoot);

    copyFileSync(
      join(repositoryRoot, "scripts", "setup-contributor-workspace.mjs"),
      join(suiteRoot, "scripts", "setup-contributor-workspace.mjs"),
    );
    copyFileSync(
      join(repositoryRoot, "templates", "contributor-workspace", "AGENTS.md"),
      join(suiteRoot, "templates", "contributor-workspace", "AGENTS.md"),
    );

    for (const repository of repositories) {
      execFileSync("git", ["init", "--bare", join(remotesRoot, `${repository}.git`)], {
        stdio: "ignore",
      });
    }

    const remotePrefix = pathToFileURL(`${remotesRoot}${sep}`).href;
    const output = execFileSync(
      process.execPath,
      [join(suiteRoot, "scripts", "setup-contributor-workspace.mjs")],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          GIT_ALLOW_PROTOCOL: "file",
          GIT_CONFIG_COUNT: "1",
          GIT_CONFIG_KEY_0: `url.${remotePrefix}.insteadOf`,
          GIT_CONFIG_VALUE_0: "https://github.com/shedflare/",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    for (const repository of repositories) {
      assert.equal(existsSync(join(workspaceRoot, repository, ".git")), true, repository);
    }
    assert.equal(existsSync(join(workspaceRoot, "AGENTS.md")), true);
    assert.equal(
      readFileSync(join(workspaceRoot, "AGENTS.md"), "utf8"),
      readFileSync(join(repositoryRoot, "templates", "contributor-workspace", "AGENTS.md"), "utf8"),
    );
    assert.match(output, /Workspace ready: 13 cloned, 1 created, 0 reused, 0 planned\./);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
