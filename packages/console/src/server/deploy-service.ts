import { spawn } from "node:child_process";
import { REPO_ROOT } from "./repo-root.ts";

const DEPLOY_SCRIPT_OVERRIDES: Record<string, string> = {
  site: "site:deploy",
};

export function deployScriptForApp(appId: string): string | null {
  if (appId === "console") return null;
  return DEPLOY_SCRIPT_OVERRIDES[appId] ?? `deploy:${appId}`;
}

export interface DeployResult {
  ok: boolean;
  exitCode: number | null;
  output: string;
  script: string;
}

export function runDeploy(appId: string): Promise<DeployResult> {
  const script = deployScriptForApp(appId);
  if (!script) {
    return Promise.resolve({
      ok: false,
      exitCode: 1,
      output: `No deploy script for app "${appId}".`,
      script: "",
    });
  }

  return new Promise((resolve) => {
    const child = spawn("pnpm", ["run", script], {
      cwd: REPO_ROOT,
      env: process.env,
      shell: false,
    });

    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on("close", (code) => {
      resolve({
        ok: code === 0,
        exitCode: code,
        output,
        script,
      });
    });
    child.on("error", (err) => {
      resolve({
        ok: false,
        exitCode: 1,
        output: `${output}\n${err.message}`,
        script,
      });
    });
  });
}

export function runDeployAll(): Promise<DeployResult> {
  return new Promise((resolve) => {
    const child = spawn("pnpm", ["run", "deploy"], {
      cwd: REPO_ROOT,
      env: process.env,
      shell: false,
    });

    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on("close", (code) => {
      resolve({
        ok: code === 0,
        exitCode: code,
        output,
        script: "deploy",
      });
    });
    child.on("error", (err) => {
      resolve({
        ok: false,
        exitCode: 1,
        output: `${output}\n${err.message}`,
        script: "deploy",
      });
    });
  });
}
