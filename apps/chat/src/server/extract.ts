import { toolDefinition } from "@tanstack/ai";
import { toStandardJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import {
  createExtractRun,
  MAX_BROWSER_RENDERS_PER_TURN,
  type ExtractRun,
  type JsonObject,
} from "#/domain";
import {
  BrowserRenderError,
  cloudflareBrowserMarkdown,
  normalizeExtractUrl,
  truncateExtractedMarkdown,
  type AppEnv,
} from "#/runtime";
import type { ToolProgressEvent } from "./search";

type ExtractToolResult =
  | {
      ok: true;
      url: string;
      /** Clean markdown extracted from the page. May be truncated. */
      content: string;
      truncated: boolean;
      originalLength: number;
    }
  | {
      ok: false;
      url: string;
      error: string;
      reason:
        | "invalid_url"
        | "duplicate_url"
        | "max_extracts_reached"
        | "not_configured"
        | "extract_timeout"
        | "extract_rate_limited"
        | "extract_auth"
        | "extract_network"
        | "extract_http"
        | "extract_empty"
        | "extract_unknown";
      hint: string;
    };

type RenderFailureReason = Exclude<
  (ExtractToolResult & { ok: false })["reason"],
  "invalid_url" | "duplicate_url" | "max_extracts_reached"
>;
type RenderErrorClassification = { reason: RenderFailureReason; hint: string };
type ClassifiedRenderError = RenderErrorClassification & { message: string };
type CaughtError = Parameters<typeof String>[0];

const ExtractToolArgsSchema = v.strictObject({
  url: v.pipe(v.string(), v.minLength(4), v.maxLength(2048)),
});
const extractToolInputSchema = toStandardJsonSchema(ExtractToolArgsSchema);

const RENDER_ERROR_CLASSIFICATIONS = {
  not_configured: {
    reason: "not_configured",
    hint: "The extract tool is not configured in this deployment. Answer without extracting.",
  },
  timeout: {
    reason: "extract_timeout",
    hint: "The page took too long to render. Try one different URL, or answer with what you have from the search results.",
  },
  rate_limited: {
    reason: "extract_rate_limited",
    hint: "Rate limited by Browser Rendering. Do not retry; answer with existing context.",
  },
  auth: {
    reason: "extract_auth",
    hint: "Browser Rendering credentials rejected. Do not retry; answer without extracting.",
  },
  network: {
    reason: "extract_network",
    hint: "Transient network error. You may try one different URL.",
  },
  http: {
    reason: "extract_http",
    hint: "The target page returned an error status. Try a different URL, or answer with existing context.",
  },
  empty: {
    reason: "extract_empty",
    hint: "The page rendered to empty content. Try a different URL or fall back to search snippets.",
  },
  invalid_url: {
    reason: "extract_http",
    hint: "The URL is malformed. Pass a full http(s) URL.",
  },
} satisfies Record<BrowserRenderError["reason"], RenderErrorClassification>;

const RENDER_ERROR_UNKNOWN_HINT = "Unknown Browser Rendering error. Do not retry more than once.";

function classifyRenderError(error: CaughtError): ClassifiedRenderError {
  if (error instanceof BrowserRenderError) {
    const classification = RENDER_ERROR_CLASSIFICATIONS[error.reason] ?? {
      reason: "extract_unknown" as const,
      hint: RENDER_ERROR_UNKNOWN_HINT,
    };
    return {
      reason: classification.reason,
      message: error.message,
      hint: classification.hint,
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return {
    reason: "extract_unknown",
    message: message.slice(0, 200),
    hint: "Unknown error. Answer with what you have.",
  };
}

function normalizeUrlKey(url: string): string {
  const parsed = normalizeExtractUrl(url);
  if (!parsed) return url.trim().toLowerCase();
  // Collapse near-duplicates: ignore trailing slash, hash, and common utm_*
  // params so the model can't blow budget by reformulating the same link.
  // Snapshot keys before mutating since URLSearchParams iterators are live.
  const clean = new URL(parsed.toString());
  const keysToStrip = Array.from(clean.searchParams.keys()).filter(
    (key) => key.startsWith("utm_") || key === "ref" || key === "fbclid" || key === "gclid",
  );
  for (const key of keysToStrip) {
    clean.searchParams.delete(key);
  }
  clean.hash = "";
  let pathname = clean.pathname;
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }
  clean.pathname = pathname;
  return clean.toString().toLowerCase();
}

type ExtractToolState = {
  /**
   * Full ExtractRun rows (mirrors search tool). Storing the final decoded
   * shape — including a stable id — lets us feed the same value straight into
   * `extract_runs_replaced` without any post-hoc enrichment, and it lets
   * tests assert on the exact row the UI will see.
   */
  extractRuns: ExtractRun[];
};

export function createBrowserExtractTool(input: {
  env: AppEnv;
  assistantMessageId: string;
  /**
   * Abort signal tied to the assistant turn. When the user presses Stop we
   * abort the turn's controller; the signal short-circuits queued tool
   * calls and tears down the Cloudflare Browser Rendering session mid-
   * fetch so the worker doesn't keep rendering a page the user no longer
   * wants.
   */
  signal?: AbortSignal;
  log?: (event: string, details?: JsonObject) => void;
  trace?: <A>(name: string, attrs: JsonObject, run: () => Promise<A>) => Promise<A>;
  onProgress?: (event: ToolProgressEvent) => void | Promise<void>;
  /**
   * Called whenever `state.extractRuns` changes (after the active row is
   * appended pre-fetch, and again when it flips to completed/failed). The
   * sync-engine wires this to an `extract_runs_replaced` server event so the
   * UI sees progress in real time, exactly like search.
   */
  onExtractStateChange?: (state: Readonly<ExtractToolState>) => void | Promise<void>;
  /**
   * Injection point. Defaults to `cloudflareBrowserMarkdown`, which hits
   * the Browser Rendering binding via puppeteer. Tests pass a fake so they
   * don't need to spin up a real Chromium session.
   *
   * Accepts an optional AbortSignal so callers can tear down the render
   * session when the assistant turn is cancelled.
   */
  extract?: (env: AppEnv, url: string, signal?: AbortSignal) => Promise<string>;
}) {
  const state: ExtractToolState = { extractRuns: [] };
  const urlCache = new Map<string, ExtractToolResult & { ok: true }>();
  const trace = input.trace ?? (<A>(_: string, __: JsonObject, run: () => Promise<A>) => run());
  const extract = input.extract ?? cloudflareBrowserMarkdown;

  /**
   * Replace the in-memory row at index `at` and publish the whole state.
   * We don't splice-in-place with a simple assignment so callers can treat
   * `state.extractRuns` as append-only from the outside — every transition
   * creates a fresh row.
   */
  const publishState = async () => {
    await input.onExtractStateChange?.({
      extractRuns: [...state.extractRuns],
    });
  };

  const tool = toolDefinition({
    name: "web_extract",
    description: [
      "Fetch a specific web page and return its full content as clean markdown via Cloudflare Browser Rendering.",
      "Use this when you already have a URL and need the full text of the page — for example, after exa_web_search surfaced a promising link, when the user pasted a URL, or when a snippet from search is clearly insufficient.",
      "",
      "Do NOT use this tool to discover URLs; use exa_web_search first if you don't already have one.",
      "Do NOT extract homepage URLs hoping to find a specific article; pass the actual article URL.",
      "",
      `Budget: at most ${MAX_BROWSER_RENDERS_PER_TURN} browser renders per assistant turn. The response is capped to the first ~12k characters; do not re-extract the same URL.`,
    ].join("\n"),
    inputSchema: extractToolInputSchema,
  }).server(async (value): Promise<ExtractToolResult> => {
    const decoded = v.safeParse(ExtractToolArgsSchema, value);
    if (!decoded.success) {
      return {
        ok: false,
        url: "",
        error: `Invalid extract arguments: ${decoded.issues.map((issue) => issue.message).join("; ")}`,
        reason: "invalid_url",
        hint: "Pass one absolute http(s) article or document URL.",
      };
    }
    const args = decoded.output;
    // Guard -1: the user already pressed Stop. The model may still be
    // emitting queued tool_calls from before the abort arrived; short-
    // circuit them instead of kicking off a Browser Rendering session we
    // immediately tear down. No activity chip — the cancel handler
    // already drove the UI into the cancelled state.
    if (input.signal?.aborted) {
      return {
        ok: false,
        url: args.url,
        error: "Request was cancelled.",
        reason: "extract_unknown",
        hint: "The user cancelled the turn; do not retry.",
      };
    }
    const rawUrl = args.url ?? "";
    const parsed = normalizeExtractUrl(rawUrl);

    // Guard 0: invalid URL.
    if (!parsed) {
      input.log?.("assistant_turn_tool_extract_rejected", {
        assistantMessageId: input.assistantMessageId,
        reason: "invalid_url",
        raw: rawUrl.slice(0, 200),
      });
      return {
        ok: false,
        url: rawUrl,
        error: "URL is not a valid http(s) URL.",
        reason: "invalid_url",
        hint: "Pass a complete URL including the scheme, e.g. https://example.com/article.",
      };
    }
    const url = parsed.toString();

    // Guard 1: per-turn budget.
    if (state.extractRuns.length >= MAX_BROWSER_RENDERS_PER_TURN) {
      input.log?.("assistant_turn_tool_extract_rejected", {
        assistantMessageId: input.assistantMessageId,
        reason: "max_extracts_reached",
        url,
        priorRuns: state.extractRuns.length,
      });
      await input.onProgress?.({
        tool: "extract",
        label: `Extract budget reached (${MAX_BROWSER_RENDERS_PER_TURN}); answering with existing content`,
        state: "failed",
        step: state.extractRuns.length + 1,
        detail: "max extracts per turn",
      });
      return {
        ok: false,
        url,
        error: `Extract budget reached: ${MAX_BROWSER_RENDERS_PER_TURN} pages already fetched this turn.`,
        reason: "max_extracts_reached",
        hint: "Do not call web_extract again this turn. Answer using the content you already have.",
      };
    }

    // Guard 2: duplicate URL. Return cached content rather than re-fetching.
    const urlKey = normalizeUrlKey(url);
    const cached = urlCache.get(urlKey);
    if (cached) {
      input.log?.("assistant_turn_tool_extract_deduped", {
        assistantMessageId: input.assistantMessageId,
        url,
        urlKey,
      });
      return {
        ok: false,
        url,
        error: "This URL (or a near-duplicate) was already extracted this turn.",
        reason: "duplicate_url",
        hint: "Do not re-extract the same URL. Use the previous content, or extract a different page.",
      };
    }

    return trace("assistant.extract.prepare", { url }, async () => {
      const step = state.extractRuns.length + 1;
      // Append an `active` row up front so the UI shows a "Reading …" chip
      // that later flips to "Read … (N chars)" via the terminal publishState
      // below. The row id is stable — we update the same slot in place so
      // extract_runs_replaced replaces cleanly on the client.
      const runIndex = state.extractRuns.length;
      const activeRun = createExtractRun({
        messageId: input.assistantMessageId,
        url,
        status: "active",
        step,
      });
      state.extractRuns.push(activeRun);
      await publishState();
      await input.onProgress?.({
        tool: "extract",
        label: `Reading ${safeHost(url) || url}`,
        state: "active",
        step,
      });

      return trace("assistant.extract.run", { url, step }, async () => {
        try {
          const markdown = await extract(input.env, url, input.signal);
          const { text, truncated, originalLength } = truncateExtractedMarkdown(markdown);
          state.extractRuns[runIndex] = createExtractRun({
            id: activeRun.id,
            createdAt: activeRun.createdAt,
            messageId: input.assistantMessageId,
            url,
            status: "completed",
            step,
            charCount: text.length,
            originalLength,
            truncated,
          });
          await publishState();
          urlCache.set(urlKey, {
            ok: true,
            url,
            content: text,
            truncated,
            originalLength,
          });
          input.log?.("assistant_turn_tool_extract_success", {
            assistantMessageId: input.assistantMessageId,
            step,
            url,
            chars: text.length,
            originalLength,
            truncated,
          });
          await input.onProgress?.({
            tool: "extract",
            label: truncated
              ? `Read ${safeHost(url) || url} (${originalLength.toLocaleString()} chars, truncated)`
              : `Read ${safeHost(url) || url} (${originalLength.toLocaleString()} chars)`,
            state: "completed",
            step,
          });
          return {
            ok: true,
            url,
            content: text,
            truncated,
            originalLength,
          } satisfies ExtractToolResult;
        } catch (error) {
          const { reason, message, hint } = classifyRenderError(error);
          // If the failure is the user pressing Stop, the cancel handler has
          // already marked the assistant message failed and painted the UI.
          // Still flip the run row to failed (so the Reading chip doesn't
          // stay "active" forever), but skip the "Failed to read X" activity
          // chip so the timeline isn't littered with fake render failures.
          const cancelled = Boolean(input.signal?.aborted);
          state.extractRuns[runIndex] = createExtractRun({
            id: activeRun.id,
            createdAt: activeRun.createdAt,
            messageId: input.assistantMessageId,
            url,
            status: "failed",
            step,
            errorMessage: cancelled ? "Cancelled" : message,
          });
          await publishState();
          input.log?.("assistant_turn_tool_extract_error", {
            assistantMessageId: input.assistantMessageId,
            step,
            url,
            error: message,
            reason,
            cancelled,
          });
          if (!cancelled) {
            await input.onProgress?.({
              tool: "extract",
              label: `Failed to read ${safeHost(url) || url}`,
              state: "failed",
              step,
              detail: message,
            });
          }
          return {
            ok: false,
            url,
            error: cancelled ? "Request was cancelled." : message,
            reason: cancelled ? "extract_unknown" : reason,
            hint: cancelled ? "The user cancelled the turn; do not retry." : hint,
          } satisfies ExtractToolResult;
        }
      });
    });
  });

  return {
    tool,
    state,
  };
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
