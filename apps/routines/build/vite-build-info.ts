import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { object, optional, parse, string } from "valibot";

const PackageJsonSchema = object({ version: optional(string()) });

function gitOutput(appDirectory: string, args: readonly string[], fallback: string): string {
  try {
    return execFileSync("git", [...args], {
      cwd: appDirectory,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
  } catch {
    return fallback;
  }
}

export function buildInfoDefines(metaUrl: string) {
  const appDirectory = dirname(fileURLToPath(metaUrl));
  const packageJson = parse(
    PackageJsonSchema,
    JSON.parse(readFileSync(join(appDirectory, "package.json"), "utf8")),
  );
  const shortCommit = gitOutput(appDirectory, ["rev-parse", "--short", "HEAD"], "dev");
  const dirty = gitOutput(appDirectory, ["status", "--short"], "").length > 0;
  const commit = `${shortCommit}${dirty ? "-dirty" : ""}`;
  const builtAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const buildStamp = builtAt.replaceAll(":", "");
  const version =
    process.env.VITE_APP_VERSION ??
    `${packageJson.version ?? "0.0.0"}+deploy.${buildStamp}.${commit}`;

  return {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(version),
    "import.meta.env.VITE_GIT_SHA": JSON.stringify(process.env.VITE_GIT_SHA ?? commit),
    "import.meta.env.VITE_BUILD_TIME": JSON.stringify(process.env.VITE_BUILD_TIME ?? builtAt),
  };
}
