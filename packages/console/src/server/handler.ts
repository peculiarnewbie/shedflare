import type { IncomingMessage, ServerResponse } from "node:http";
import { CfEnvError, resolveCfEnv } from "./env.ts";
import { loadConfig, mergeConfigPatch, writeConfig } from "./config-service.ts";
import { fetchSuiteOverview } from "./inventory-service.ts";
import { fetchBillableUsage, fetchScriptUsage, fetchUsage } from "./usage-service.ts";
import { runDeploy, runDeployAll } from "./deploy-service.ts";

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return null;
  return JSON.parse(raw) as unknown;
}

function route(pathname: string): { name: string; params: Record<string, string> } | null {
  const routes: Array<{ pattern: RegExp; name: string; params?: string[] }> = [
    { pattern: /^\/api\/health$/, name: "health" },
    { pattern: /^\/api\/overview$/, name: "overview" },
    { pattern: /^\/api\/config$/, name: "config" },
    { pattern: /^\/api\/usage$/, name: "usage" },
    { pattern: /^\/api\/billable-usage$/, name: "billable-usage" },
    { pattern: /^\/api\/script-usage$/, name: "script-usage" },
    { pattern: /^\/api\/deploy\/([^/]+)$/, name: "deploy-app", params: ["appId"] },
    { pattern: /^\/api\/deploy$/, name: "deploy-all" },
  ];

  for (const routeDef of routes) {
    const match = pathname.match(routeDef.pattern);
    if (!match) continue;
    const params: Record<string, string> = {};
    routeDef.params?.forEach((key, i) => {
      params[key] = match[i + 1] ?? "";
    });
    return { name: routeDef.name, params };
  }
  return null;
}

export async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  if (!url.pathname.startsWith("/api/")) return false;

  const matched = route(url.pathname);
  if (!matched) {
    json(res, 404, { error: "Not found" });
    return true;
  }

  try {
    if (matched.name === "health") {
      json(res, 200, { ok: true });
      return true;
    }

    if (matched.name === "config") {
      if (req.method === "GET") {
        const config = loadConfig();
        json(res, 200, { config, configPath: "shedflare.config.jsonc" });
        return true;
      }
      if (req.method === "PATCH") {
        const current = loadConfig();
        if (!current) {
          json(res, 400, { error: "shedflare.config.jsonc not found" });
          return true;
        }
        const patch = (await readBody(req)) as Parameters<typeof mergeConfigPatch>[1];
        const next = mergeConfigPatch(current, patch);
        writeConfig(next);
        json(res, 200, { config: next });
        return true;
      }
      json(res, 405, { error: "Method not allowed" });
      return true;
    }

    let env;
    try {
      env = resolveCfEnv();
    } catch (e) {
      if (e instanceof CfEnvError) {
        json(res, 503, { error: e.message });
        return true;
      }
      throw e;
    }

    if (matched.name === "overview") {
      json(res, 200, await fetchSuiteOverview(env));
      return true;
    }

    if (matched.name === "usage") {
      json(res, 200, await fetchUsage(env));
      return true;
    }

    if (matched.name === "billable-usage") {
      json(res, 200, await fetchBillableUsage(env));
      return true;
    }

    if (matched.name === "script-usage") {
      json(res, 200, { scripts: await fetchScriptUsage(env) });
      return true;
    }

    if (matched.name === "deploy-app" && req.method === "POST") {
      const result = await runDeploy(matched.params.appId);
      json(res, result.ok ? 200 : 500, result);
      return true;
    }

    if (matched.name === "deploy-all" && req.method === "POST") {
      const result = await runDeployAll();
      json(res, result.ok ? 200 : 500, result);
      return true;
    }

    json(res, 405, { error: "Method not allowed" });
    return true;
  } catch (e) {
    json(res, 500, { error: e instanceof Error ? e.message : String(e) });
    return true;
  }
}
