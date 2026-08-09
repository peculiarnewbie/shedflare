import { ExaSearchError, clampExaResults, exaMcpSearchRawText, exaSearch } from "#/search/exa";
import { buildSearchContext } from "#/search/format";

const MIN_QUERY_CHARS = 2;
const DEFAULT_SEARCHES_PER_TURN = 3;

export type SearchToolResult =
  | { ok: true; context: string; disableFurtherToolCalls?: boolean }
  | { ok: false; error: string; hint: string; disableFurtherToolCalls?: boolean };

function normalizeQueryKey(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function classifyExaError(error: unknown): { error: string; hint: string } {
  if (error instanceof ExaSearchError) {
    switch (error.reason) {
      case "timeout":
        return {
          error: error.message,
          hint: "Search timed out. Try a shorter query or answer without search.",
        };
      case "rate_limited":
        return {
          error: error.message,
          hint: "Rate limited. Answer with what you already know.",
        };
      case "auth":
        return {
          error: error.message,
          hint: "Search is unavailable. Answer without search.",
        };
      default:
        return {
          error: error.message,
          hint: "Search failed. Reformulate or answer without search.",
        };
    }
  }
  const message = error instanceof Error ? error.message : String(error);
  return { error: message.slice(0, 200), hint: "Unknown search error." };
}

export function createSearchExecutor(input: {
  exaApiKey?: string;
  preferFreeSearch?: boolean;
  maxSearchesPerTurn?: number;
  signal?: AbortSignal;
}) {
  const maxSearches = input.maxSearchesPerTurn ?? DEFAULT_SEARCHES_PER_TURN;
  const queryCache = new Map<string, string>();
  let searchCount = 0;

  return async function runExaWebSearch(args: {
    query?: string;
    numResults?: number;
  }): Promise<SearchToolResult> {
    if (input.signal?.aborted) {
      return {
        ok: false,
        error: "Request was cancelled.",
        hint: "Do not retry.",
      };
    }

    const query = (typeof args.query === "string" ? args.query : "").trim().replace(/\s+/g, " ");
    const numResults = clampExaResults(args.numResults);

    if (!query) {
      return {
        ok: false,
        error: "Query was empty.",
        hint: "Provide a non-empty search query.",
      };
    }
    if (query.length < MIN_QUERY_CHARS) {
      return {
        ok: false,
        error: `Query is too short (${query.length} chars).`,
        hint: "Use a longer search query.",
      };
    }
    if (searchCount >= maxSearches) {
      return {
        ok: false,
        error: `Search budget reached (${maxSearches} per turn).`,
        hint: "Do not search again. Answer using prior results.",
        disableFurtherToolCalls: true,
      };
    }

    const queryKey = normalizeQueryKey(query);
    const cached = queryCache.get(queryKey);
    if (cached) {
      return {
        ok: false,
        error: "Duplicate query this turn.",
        hint: "Use prior results or try a different angle.",
      };
    }

    searchCount += 1;

    try {
      const useApi = Boolean(input.exaApiKey?.trim()) && !input.preferFreeSearch;
      let context: string;

      if (useApi) {
        const rows = await exaSearch(input.exaApiKey!, query, numResults, input.signal);
        context = buildSearchContext({ query, rows });
      } else {
        const rawText = await exaMcpSearchRawText(query, numResults, input.signal);
        context = buildSearchContext({ query, rawText });
      }

      queryCache.set(queryKey, context);
      const budgetExhausted = searchCount >= maxSearches;
      return {
        ok: true,
        context,
        ...(budgetExhausted ? { disableFurtherToolCalls: true } : {}),
      };
    } catch (error) {
      const { error: message, hint } = classifyExaError(error);
      return { ok: false, error: message, hint };
    }
  };
}

export const EXA_WEB_SEARCH_TOOL = {
  type: "function" as const,
  function: {
    name: "exa_web_search",
    description: [
      "Search the web via Exa for current or external information.",
      "Use when the user asks about recent events, facts you are unsure of, or anything that benefits from live data.",
      "At most a few searches per turn — stop once you have enough to answer.",
    ].join(" "),
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query.", minLength: 2, maxLength: 400 },
        numResults: {
          type: "number",
          description: "Number of results (3–8). Default 5.",
          minimum: 3,
          maximum: 8,
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
};

export const SEARCH_SYSTEM_PROMPT = [
  "You have access to exa_web_search for live web grounding.",
  "Use it when the question needs current or verified external facts.",
  "After searching, answer concisely for Discord chat.",
].join(" ");
