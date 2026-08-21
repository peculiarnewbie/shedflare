const DEFAULT_EXA_RESULTS = 5;
const MIN_EXA_RESULTS = 3;
const MAX_EXA_RESULTS = 8;
const EXA_REQUEST_TIMEOUT_MS = 60_000;
const EXA_MCP_REQUEST_TIMEOUT_MS = 60_000;
const EXA_MAX_ATTEMPTS = 2;
const EXA_RETRY_BACKOFF_MS = 500;

const ExaSearchResponseSchema = object({
  results: optional(
    array(
      object({
        title: optional(string()),
        url: string(),
        highlights: optional(array(string())),
        summary: optional(nullable(string())),
        text: optional(string()),
      }),
    ),
  ),
});

const ExaMcpResponseSchema = object({
  result: optional(
    object({
      content: optional(array(object({ type: optional(string()), text: optional(string()) }))),
    }),
  ),
});

export type ExaSearchRow = {
  title: string;
  url: string;
  snippet: string;
};

export class ExaSearchError extends Error {
  readonly status: number | null;
  readonly retryable: boolean;
  readonly reason: "timeout" | "network" | "http" | "empty" | "auth" | "rate_limited";

  constructor(
    message: string,
    init: {
      status?: number | null;
      retryable: boolean;
      reason: ExaSearchError["reason"];
    },
  ) {
    super(message);
    this.name = "ExaSearchError";
    this.status = init.status ?? null;
    this.retryable = init.retryable;
    this.reason = init.reason;
  }
}

export function clampExaResults(value: number | null | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_EXA_RESULTS;
  return Math.min(MAX_EXA_RESULTS, Math.max(MIN_EXA_RESULTS, Math.round(Number(value))));
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)),
    timeoutMs,
  );
  let externalListener: (() => void) | null = null;
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      externalListener = () => controller.abort(externalSignal.reason);
      externalSignal.addEventListener("abort", externalListener, { once: true });
    }
  }
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    if (externalSignal && externalListener) {
      externalSignal.removeEventListener("abort", externalListener);
    }
  }
}

function extractSnippet(result: {
  highlights?: string[];
  summary?: string | null;
  text?: string;
}): string {
  const highlight = result.highlights?.[0]?.trim();
  if (highlight) return highlight;
  const summary = result.summary?.trim();
  if (summary) return summary.slice(0, 700);
  const text = result.text?.trim();
  if (text) return text.slice(0, 500);
  return "";
}

export async function exaSearch(
  apiKey: string,
  query: string,
  numResults = DEFAULT_EXA_RESULTS,
  signal?: AbortSignal,
): Promise<ExaSearchRow[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new ExaSearchError("Exa search query is empty", {
      retryable: false,
      reason: "empty",
    });
  }

  const clamped = clampExaResults(numResults);
  let lastError: ExaSearchError | null = null;

  for (let attempt = 1; attempt <= EXA_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetchWithTimeout(
        "https://api.exa.ai/search",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
          },
          body: JSON.stringify({
            query: trimmed,
            numResults: clamped,
            useAutoprompt: true,
            type: "auto",
            contents: {
              highlights: { numSentences: 3, highlightsPerUrl: 1, query: trimmed },
              summary: { query: trimmed },
              text: { maxCharacters: 1200 },
              livecrawl: "fallback",
            },
          }),
        },
        EXA_REQUEST_TIMEOUT_MS,
        signal,
      );

      if (!response.ok) {
        const status = response.status;
        const retryable = status >= 500 || status === 429;
        const reason: ExaSearchError["reason"] =
          status === 401 || status === 403 ? "auth" : status === 429 ? "rate_limited" : "http";
        const err = new ExaSearchError(`Exa search failed: HTTP ${status}`, {
          status,
          retryable,
          reason,
        });
        if (!retryable || attempt === EXA_MAX_ATTEMPTS) throw err;
        lastError = err;
        await sleep(EXA_RETRY_BACKOFF_MS * attempt);
        continue;
      }

      const json = parse(ExaSearchResponseSchema, await response.json());

      return (json.results ?? [])
        .filter((row) => row.url.length > 0)
        .map((row) => ({
          title: row.title ?? row.url,
          url: row.url,
          snippet: extractSnippet(row),
        }));
    } catch (error) {
      if (error instanceof ExaSearchError) {
        if (signal?.aborted) throw error;
        if (!error.retryable || attempt === EXA_MAX_ATTEMPTS) throw error;
        lastError = error;
        await sleep(EXA_RETRY_BACKOFF_MS * attempt);
        continue;
      }
      const message = error instanceof Error ? error.message : String(error);
      const err = new ExaSearchError(`Exa network error: ${message.slice(0, 200)}`, {
        retryable: true,
        reason: "network",
      });
      if (signal?.aborted) throw err;
      if (attempt === EXA_MAX_ATTEMPTS) throw err;
      lastError = err;
      await sleep(EXA_RETRY_BACKOFF_MS * attempt);
    }
  }

  throw (
    lastError ??
    new ExaSearchError("Exa search failed after retries", { retryable: true, reason: "network" })
  );
}

function parseExaMcpTextResponse(responseText: string) {
  for (const line of responseText.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const payload = parse(ExaMcpResponseSchema, JSON.parse(line.slice(6)));
    const text = payload?.result?.content?.find((item) => item?.type === "text")?.text;
    if (text?.trim()) return text.trim();
  }
  return "";
}

export async function exaMcpSearchRawText(
  query: string,
  numResults = DEFAULT_EXA_RESULTS,
  signal?: AbortSignal,
): Promise<string> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new ExaSearchError("Exa MCP query is empty", { retryable: false, reason: "empty" });
  }

  let lastError: ExaSearchError | null = null;
  for (let attempt = 1; attempt <= EXA_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetchWithTimeout(
        "https://mcp.exa.ai/mcp",
        {
          method: "POST",
          headers: {
            accept: "application/json, text/event-stream",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: {
              name: "web_search_exa",
              arguments: {
                query: trimmed,
                type: "auto",
                numResults: clampExaResults(numResults),
                livecrawl: "fallback",
                contextMaxCharacters: 3500,
              },
            },
          }),
        },
        EXA_MCP_REQUEST_TIMEOUT_MS,
        signal,
      );

      if (!response.ok) {
        const status = response.status;
        const retryable = status >= 500 || status === 429;
        const err = new ExaSearchError(`Exa MCP search failed: HTTP ${status}`, {
          status,
          retryable,
          reason: status === 429 ? "rate_limited" : "http",
        });
        if (!retryable || attempt === EXA_MAX_ATTEMPTS) throw err;
        lastError = err;
        await sleep(EXA_RETRY_BACKOFF_MS * attempt);
        continue;
      }

      const text = parseExaMcpTextResponse(await response.text());
      if (!text) {
        throw new ExaSearchError("Exa MCP search returned no content", {
          status: response.status,
          retryable: false,
          reason: "empty",
        });
      }
      return text;
    } catch (error) {
      if (error instanceof ExaSearchError) {
        if (signal?.aborted) throw error;
        if (!error.retryable || attempt === EXA_MAX_ATTEMPTS) throw error;
        lastError = error;
        await sleep(EXA_RETRY_BACKOFF_MS * attempt);
        continue;
      }
      const message = error instanceof Error ? error.message : String(error);
      const err = new ExaSearchError(`Exa MCP network error: ${message.slice(0, 200)}`, {
        retryable: true,
        reason: "network",
      });
      if (signal?.aborted) throw err;
      if (attempt === EXA_MAX_ATTEMPTS) throw err;
      lastError = err;
      await sleep(EXA_RETRY_BACKOFF_MS * attempt);
    }
  }

  throw (
    lastError ??
    new ExaSearchError("Exa MCP search failed after retries", {
      retryable: true,
      reason: "network",
    })
  );
}
import { array, nullable, object, optional, parse, string } from "valibot";
