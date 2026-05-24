import { defineConfig } from "vite-plus";
import { cloudflare } from "@cloudflare/vite-plugin";
import solid from "vite-plugin-solid";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version?: string;
};
const repoDir = path.dirname(fileURLToPath(import.meta.url));

function gitCommit() {
  try {
    return execSync("git rev-parse --short HEAD", {
      cwd: repoDir,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "dev";
  }
}

const commit = gitCommit();
const buildStamp = new Date()
  .toISOString()
  .replace(/\.\d{3}Z$/, "Z")
  .replace(/[:]/g, "");
const computedVersion = process.env.VITE_APP_VERSION || `${pkg.version ?? "0.0.0"}+deploy.${buildStamp}.${commit}`;
const computedCommit = process.env.VITE_GIT_SHA || commit;
const computedBuildTime = process.env.VITE_BUILD_TIME || buildStamp;

export default defineConfig({
  resolve: {
    alias: {
      "#": path.resolve(repoDir, "src"),
    },
  },
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(computedVersion),
    "import.meta.env.VITE_GIT_SHA": JSON.stringify(computedCommit),
    "import.meta.env.VITE_BUILD_TIME": JSON.stringify(computedBuildTime),
  },
  plugins: [solid(), ...(process.env.VITEST ? [] : [cloudflare()])],
  server: {
    allowedHosts: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/solid-js") || id.includes("node_modules/@solidjs")) {
            return "vendor";
          }
          if (
            id.includes("node_modules/marked") ||
            id.includes("node_modules/dompurify") ||
            id.includes("node_modules/highlight.js")
          ) {
            return "markdown";
          }
          if (id.includes("node_modules/effect")) {
            return "effect";
          }
        },
      },
    },
  },
  staged: {
    "*": "vp check --fix",
  },
  lint: { options: { typeAware: true, typeCheck: true } },
});
