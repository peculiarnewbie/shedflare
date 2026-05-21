import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const chatDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(chatDir, "../..");
const pkg = JSON.parse(readFileSync(path.join(chatDir, "package.json"), "utf8"));

function gitCommit() {
  try {
    return execSync("git rev-parse --short HEAD", {
      cwd: chatDir,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

function buildVersion() {
  const stamp = new Date()
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[:]/g, "");
  const commit = gitCommit();
  return {
    version: `${pkg.version ?? "0.0.0"}+deploy.${stamp}.${commit}`,
    commit,
    builtAt: new Date().toISOString(),
  };
}

const meta = buildVersion();
const env = {
  ...process.env,
  VITE_APP_VERSION: meta.version,
  VITE_GIT_SHA: meta.commit,
  VITE_BUILD_TIME: meta.builtAt,
};

console.log(`[deploy] version ${meta.version}`);
execSync("vp build", { cwd: chatDir, stdio: "inherit", env });
execSync("vp exec alchemy deploy apps/chat/alchemy.run.ts", {
  cwd: repoRoot,
  stdio: "inherit",
  env,
});
