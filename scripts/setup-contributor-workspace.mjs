#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const suiteRoot = resolve(scriptDirectory, "..");
const workspaceRoot = dirname(suiteRoot);

function usage() {
  return `Create the Shedflare contributor workspace around this suite checkout.

Usage:
  node scripts/setup-contributor-workspace.mjs [--ssh] [--dry-run]

Options:
  --ssh      Clone with git@github.com URLs instead of HTTPS.
  --dry-run  Show what would be created without changing the filesystem.
  --help     Show this help.
`;
}

function parseArguments(arguments_) {
  const options = { dryRun: false, ssh: false };

  for (const argument of arguments_) {
    if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--ssh") options.ssh = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`Unknown option: ${argument}\n\n${usage()}`);
  }

  return options;
}

function repositoryUrl(repository, ssh) {
  return ssh
    ? `git@github.com:shedflare/${repository}.git`
    : `https://github.com/shedflare/${repository}.git`;
}

function canonicalRepository(value) {
  return value
    .trim()
    .replace(/^git@github\.com:/, "https://github.com/")
    .replace(/\.git$/, "")
    .replace(/\/$/, "");
}

function readOrigin(repositoryPath) {
  return execFileSync("git", ["-C", repositoryPath, "remote", "get-url", "origin"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function verifyExistingRepository(repository, repositoryPath) {
  if (!statSync(repositoryPath).isDirectory() || !existsSync(join(repositoryPath, ".git"))) {
    throw new Error(`${repositoryPath} exists but is not a Git repository.`);
  }

  const actual = canonicalRepository(readOrigin(repositoryPath));
  const expected = `https://github.com/shedflare/${repository}`;
  if (actual !== expected) {
    throw new Error(
      `${repositoryPath} has origin ${actual}; expected ${expected}. Move it aside or correct its remote before retrying.`,
    );
  }
}

function cloneRepository(repository, repositoryPath, options) {
  if (existsSync(repositoryPath)) {
    verifyExistingRepository(repository, repositoryPath);
    console.log(`reuse  ${repository}`);
    return "reused";
  }

  if (options.dryRun) {
    console.log(`clone  ${repository} -> ${repositoryPath}`);
    return "planned";
  }

  execFileSync(
    "git",
    ["clone", "--origin", "origin", repositoryUrl(repository, options.ssh), repositoryPath],
    {
      stdio: "inherit",
    },
  );
  return "cloned";
}

function installWorkspaceGuidance(options) {
  const source = join(suiteRoot, "templates", "contributor-workspace", "AGENTS.md");
  const target = join(workspaceRoot, "AGENTS.md");

  if (existsSync(target)) {
    console.log("reuse  AGENTS.md");
    return "reused";
  }

  if (options.dryRun) {
    console.log(`create AGENTS.md -> ${target}`);
    return "planned";
  }

  copyFileSync(source, target);
  console.log("create AGENTS.md");
  return "created";
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }

  execFileSync("git", ["--version"], { stdio: "ignore" });
  mkdirSync(workspaceRoot, { recursive: true });

  console.log(`Shedflare contributor workspace: ${workspaceRoot}`);
  if (suiteRoot !== join(workspaceRoot, "shedflare")) {
    console.warn(
      `warning: the orchestrator checkout is named differently from ${join(workspaceRoot, "shedflare")}`,
    );
  }

  const counts = { cloned: 0, created: 0, planned: 0, reused: 0 };
  for (const repository of repositories) {
    counts[cloneRepository(repository, join(workspaceRoot, repository), options)] += 1;
  }
  counts[installWorkspaceGuidance(options)] += 1;

  const action = options.dryRun ? "Plan complete" : "Workspace ready";
  console.log(
    `${action}: ${counts.cloned} cloned, ${counts.created} created, ${counts.reused} reused, ${counts.planned} planned.`,
  );
  console.log(
    "Install and test only the repositories involved in your change; they remain independent workspaces.",
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
