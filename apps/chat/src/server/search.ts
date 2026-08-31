import { toolDefinition } from "@tanstack/ai";
import { toStandardJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import {
  buildMultiSearchContext,
  createSearchRun,
  decodeSearchResultRow,
  type JsonObject,
  type SearchResult,
  type SearchRun,
} from "#/domain";
import {
  clampExaResults,
  exaMcpSearchRawText,
  exaSearch,
  ExaSearchError,
  type AppEnv,
} from "#/runtime";

const SEARCH_RESULTS_PER_RUN = 5;
/** Minimum normalized query length. Anything shorter is probably garbage
 *  (the model accidentally sending a single word or an empty string). */
const MIN_QUERY_CHARS = 2;
const MAX_QUERY_CHARS = 400;
const MIN_RESULTS_PER_RUN = 3;
const MAX_RESULTS_PER_RUN = 8;

const SearchToolArgsSchema = v.strictObject({
  query: v.pipe(
    v.string(),
    v.minLength(MIN_QUERY_CHARS),
    v.maxLength(MAX_QUERY_CHARS),
    v.description("Search query."),
  ),
  numResults: v.optional(
    v.pipe(
      v.number(),
      v.minValue(MIN_RESULTS_PER_RUN),
      v.maxValue(MAX_RESULTS_PER_RUN),
      v.description(
        "Desired number of results to retrieve. Default 5. Use more only when comparing multiple sources.",
      ),
    ),
  ),
});
const searchToolInputSchema = toStandardJsonSchema(SearchToolArgsSchema);

type SearchGroundingRun = {
  query: string;
  rows?: Array<{ title: string; url: string; snippet: string }>;
  rawText?: string;
};

/**
 * Progress event shared by `exa_web_search` and `web_extract`.
 *
 * `tool` is the discriminator the UI branches on: search and extract both
 * emit stepped activities, and without this field step 1 of extract would
 * collide with step 1 of search in the timeline builder. Existing callers
 * that predate the extract wiring may still omit it — those default to the
 * search chip, which is the behavior we had before.
 */
export type ToolProgressEvent = {
  tool?: "search" | "extract";
  label: string;
  state?: "active" | "completed" | "failed";
  step?: number;
  query?: string;
  detail?: string;
};

export const TOOL_PROGRESS_EVENT = "shedflare.tool-progress";

/** @deprecated use ToolProgressEvent. Kept as an alias to avoid churn. */
export type SearchProgressEvent = ToolProgressEvent;

type SearchToolState = {
  searchRuns: SearchRun[];
  searchResults: SearchResult[];
};

function summarizeStructuredResults(rows: Array<{ title: string; snippet: string }>) {
  return rows
    .slice(0, 3)
    .map((row) => [row.title, row.snippet].filter(Boolean).join(" - "))
    .filter(Boolean)
    .join(" | ")
    .slice(0, 240);
}

function summarizeRawText(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 240);
}

/**
 * Result returned to the LLM for a tool call. Always JSON-serializable.
 * Upstream failures are structured so the model can decide whether to retry
 * or answer with the context it already has.
 */
type ExaFailureReason =
  | "exa_timeout"
  | "exa_rate_limited"
  | "exa_auth"
  | "exa_network"
  | "exa_http"
  | "exa_empty"
  | "exa_unknown";

type SearchFailureReason = "empty_query" | "query_too_short" | ExaFailureReason;

type SearchToolResult =
  | {
      ok: true;
      query: string;
      resultCount: number;
      context: string;
    }
  | {
      ok: false;
      query: string;
      error: string;
      reason: SearchFailureReason;
      hint: string;
    };

const SearchToolResultSchema = v.variant("ok", [
  v.strictObject({
    ok: v.literal(true),
    query: v.string(),
    resultCount: v.number(),
    context: v.string(),
  }),
  v.strictObject({
    ok: v.literal(false),
    query: v.string(),
    error: v.string(),
    reason: v.string(),
    hint: v.string(),
  }),
]);
const searchToolOutputSchema = toStandardJsonSchema(SearchToolResultSchema);

type ExaErrorClassification = {
  reason: ExaFailureReason;
  message: string;
  hint: string;
};
type CaughtError = Parameters<typeof String>[0];

function classifyExaError(error: CaughtError): ExaErrorClassification {
  if (error instanceof ExaSearchError) {
    switch (error.reason) {
      case "timeout":
        return {
          reason: "exa_timeout",
          message: error.message,
          hint: "The search service timed out. Try one more time with a shorter, keyword-only query, or proceed without search.",
        };
      case "rate_limited":
        return {
          reason: "exa_rate_limited",
          message: error.message,
          hint: "Rate limited. Do not retry; answer with what you already know and note that live info wasn't available.",
        };
      case "auth":
        return {
          reason: "exa_auth",
          message: error.message,
          hint: "Search is unavailable in this environment. Do not retry; answer without search.",
        };
      case "network":
        return {
          reason: "exa_network",
          message: error.message,
          hint: "Transient network error. You may try one different query, but do not loop.",
        };
      case "http":
        return {
          reason: "exa_http",
          message: error.message,
          hint: "The search service returned an error. Reformulate with different keywords, or proceed without search.",
        };
      case "empty":
        return {
          reason: "exa_empty",
          message: error.message,
          hint: "No content returned. Try a different keyword phrasing.",
        };
      default:
        return {
          reason: "exa_unknown",
          message: error.message,
          hint: "Unknown search error. Do not retry more than once.",
        };
    }
  }
  const message = error instanceof Error ? error.message : String(error);
  return {
    reason: "exa_unknown",
    message: message.slice(0, 200),
    hint: "Unknown error. Answer with what you have.",
  };
}

export function createExaSearchTool(input: {
  env: AppEnv;
  assistantMessageId: string;
  /**
   * When true, skip the Exa API path even if EXA_API_KEY is configured
   * and use the public MCP endpoint instead. Surfaced as a user-facing
   * setting ("Use free web search") so users on a shared deployment
   * can opt out of the paid API.
   */
  preferFreeExa?: boolean;
  log?: (event: string, details?: JsonObject) => void;
  trace?: <A>(name: string, attrs: JsonObject, run: () => Promise<A>) => Promise<A>;
  onSearchStateChange?: (state: Readonly<SearchToolState>) => void | Promise<void>;
}) {
  const state: SearchToolState = {
    searchRuns: [],
    searchResults: [],
  };

  const publishState = async () => {
    await input.onSearchStateChange?.({
      searchRuns: [...state.searchRuns],
      searchResults: [...state.searchResults],
    });
  };
  const trace = input.trace ?? (<A>(_: string, __: JsonObject, run: () => Promise<A>) => run());

  const tool = toolDefinition({
    name: "exa_web_search",
    description: [
      "Search the web for current or externally verifiable information.",
      "Returns ranked sources with titles, URLs, and snippets.",
      "Use it only when fresh sources would materially improve the answer; answer directly from existing context otherwise.",
    ].join(" "),
    inputSchema: searchToolInputSchema,
    outputSchema: searchToolOutputSchema,
  }).server(async (args, context): Promise<SearchToolResult> => {
    // The model-emitted input is validated by TanStack AI against the Standard
    // Schema before this executor runs.
    // The user may already have pressed Stop while the call was queued.
    // queued tool_calls from before the abort landed; short-circuit them
    // so we don't fire a web search whose result will be thrown away.
    const signal = context?.abortSignal;
    if (signal?.aborted) {
      return {
        ok: false,
        query: args.query,
        error: "Request was cancelled.",
        reason: "exa_unknown",
        hint: "The user cancelled the turn; do not retry.",
      };
    }
    const query = args.query.trim().replace(/\s+/g, " ");
    const numResults = clampExaResults(args.numResults ?? SEARCH_RESULTS_PER_RUN);

    // The JSON Schema length constraint applies to raw input. Re-check after
    // whitespace normalization so values such as "  " cannot pass through.
    if (!query) {
      return {
        ok: false,
        query: "",
        error: "Query was empty after whitespace normalization.",
        reason: "empty_query",
        hint: "Provide a non-empty search query.",
      };
    }
    if (query.length < MIN_QUERY_CHARS) {
      return {
        ok: false,
        query,
        error: `Query is too short (${query.length} chars).`,
        reason: "query_too_short",
        hint: "Use a longer search query.",
      };
    }

    const step = state.searchRuns.length + 1;
    return trace("assistant.search.prepare", { query, numResults }, async () => {
      context?.emitCustomEvent(TOOL_PROGRESS_EVENT, {
        tool: "search",
        label: `Searching the web for "${query}"`,
        state: "active",
        step,
        query,
      });

      return trace("assistant.search.run", { query, step, numResults }, async () => {
        try {
          let groundingRun: SearchGroundingRun;
          let groundingContext: string;
          let resultCount = 0;

          if (input.env.EXA_API_KEY && !input.preferFreeExa) {
            const runRows = (await exaSearch(input.env, query, numResults, signal)).map((row) =>
              decodeSearchResultRow({
                ...row,
                searchRunId: "",
                messageId: input.assistantMessageId,
              }),
            );
            const run = createSearchRun({
              messageId: input.assistantMessageId,
              query,
              status: "completed",
              step,
              numResults,
              resultCount: runRows.length,
              previewText: summarizeStructuredResults(runRows),
              mode: "api",
            });
            const normalizedRows = runRows.map((row) =>
              decodeSearchResultRow({
                ...row,
                searchRunId: run.id,
                messageId: input.assistantMessageId,
              }),
            );

            state.searchRuns.push(run);
            state.searchResults.push(...normalizedRows);
            resultCount = normalizedRows.length;
            groundingRun = {
              query,
              rows: normalizedRows.map((row) => ({
                title: row.title,
                url: row.url,
                snippet: row.snippet,
              })),
            };

            input.log?.("assistant_turn_tool_search_success", {
              assistantMessageId: input.assistantMessageId,
              step,
              query,
              resultCount: normalizedRows.length,
              mode: "exa_api",
              previewText: run.previewText,
            });
            context?.emitCustomEvent(TOOL_PROGRESS_EVENT, {
              tool: "search",
              label:
                normalizedRows.length > 0
                  ? `Found ${normalizedRows.length} result${normalizedRows.length === 1 ? "" : "s"} for "${query}"`
                  : `No results for "${query}"`,
              state: "completed",
              step,
              query,
              detail: run.previewText || undefined,
            });
          } else {
            const rawText = await exaMcpSearchRawText(query, numResults, signal);
            const run = createSearchRun({
              messageId: input.assistantMessageId,
              query,
              status: "completed",
              step,
              numResults,
              resultCount: 0,
              previewText: summarizeRawText(rawText),
              mode: "mcp",
            });

            state.searchRuns.push(run);
            resultCount = rawText ? 1 : 0;
            groundingRun = {
              query,
              rawText,
            };

            input.log?.("assistant_turn_tool_search_success", {
              assistantMessageId: input.assistantMessageId,
              step,
              query,
              resultCount: 0,
              mode: "exa_mcp",
              previewText: run.previewText,
            });
            context?.emitCustomEvent(TOOL_PROGRESS_EVENT, {
              tool: "search",
              label: `Search finished for "${query}"`,
              state: "completed",
              step,
              query,
              detail: run.previewText || undefined,
            });
          }

          groundingContext = buildMultiSearchContext({ runs: [groundingRun] });
          await publishState();
          return {
            ok: true,
            query,
            resultCount,
            context: groundingContext,
          } satisfies SearchToolResult;
        } catch (error) {
          const { reason, message, hint } = classifyExaError(error);
          // If the user pressed Stop mid-search, the cancel handler already
          // drove the UI into the cancelled state. Keep the run row so the
          // Searching chip doesn't stay "active", but suppress the "Search
          // failed for X" activity chip — that would lie about what
          // happened.
          const cancelled = Boolean(signal?.aborted);
          state.searchRuns.push(
            createSearchRun({
              messageId: input.assistantMessageId,
              query,
              status: "failed",
              step,
              numResults,
              errorMessage: cancelled ? "Cancelled" : message,
              mode: input.env.EXA_API_KEY && !input.preferFreeExa ? "api" : "mcp",
            }),
          );
          await publishState();
          input.log?.("assistant_turn_tool_search_error", {
            assistantMessageId: input.assistantMessageId,
            step,
            query,
            error: message,
            reason,
            cancelled,
          });
          if (!cancelled) {
            context?.emitCustomEvent(TOOL_PROGRESS_EVENT, {
              tool: "search",
              label: `Search failed for "${query}"`,
              state: "failed",
              step,
              query,
              detail: message,
            });
          }
          // Return an actionable failure that the model can reason about.
          return {
            ok: false,
            query,
            error: cancelled ? "Request was cancelled." : message,
            reason: cancelled ? "exa_unknown" : reason,
            hint: cancelled ? "The user cancelled the turn; do not retry." : hint,
          } satisfies SearchToolResult;
        }
      });
    });
  });

  return {
    tool,
    state,
  };
}
