import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type PackageJson = {
  version?: string;
};

function gitCommit(cwd: string) {
  try {
    return execSync("git rev-parse --short HEAD", {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "dev";
  }
}

export function buildInfoDefines(metaUrl: string) {
  const appDir = path.dirname(fileURLToPath(metaUrl));
  const pkg = JSON.parse(readFileSync(path.join(appDir, "package.json"), "utf8")) as PackageJson;
  const commit = gitCommit(appDir);
  const builtAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const buildStamp = builtAt.replace(/[:]/g, "");
  const version =
    process.env.VITE_APP_VERSION || `${pkg.version ?? "0.0.0"}+deploy.${buildStamp}.${commit}`;

  return {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(version),
    "import.meta.env.VITE_GIT_SHA": JSON.stringify(process.env.VITE_GIT_SHA || commit),
    "import.meta.env.VITE_BUILD_TIME": JSON.stringify(process.env.VITE_BUILD_TIME || builtAt),
  } satisfies Record<string, string>;
}
