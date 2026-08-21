import {
  EXA_WEB_SEARCH_TOOL,
  SEARCH_SYSTEM_PROMPT,
  createSearchExecutor,
  type SearchToolResult,
} from "#/search/tool";
import { array, literal, nullable, number, object, optional, safeParse, string } from "valibot";

const OPENCODE_GO_BASE_URL = "https://opencode.ai/zen/go/v1";
const MAX_TOOL_ITERATIONS = 10;

export type TurnMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

const ToolCallSchema = object({
  id: string(),
  type: literal("function"),
  function: object({ name: string(), arguments: string() }),
});
const CompletionResponseSchema = object({
  choices: optional(
    array(
      object({
        message: optional(
          object({
            content: optional(nullable(string())),
            tool_calls: optional(array(ToolCallSchema)),
          }),
        ),
        finish_reason: optional(string()),
      }),
    ),
  ),
});
const SearchArgumentsSchema = object({ query: optional(string()), numResults: optional(number()) });
type SearchArguments = { query?: string; numResults?: number };
type SuccessfulSearchPayload = { ok: true; context: string; hint?: string };
type FailedSearchPayload = {
  ok: false;
  error: string;
  hint: string;
  disableFurtherToolCalls?: boolean;
};

type CompletionRequest = {
  model: string;
  stream: false;
  max_tokens: number;
  temperature: number;
  messages: TurnMessage[];
  tools?: (typeof EXA_WEB_SEARCH_TOOL)[];
  tool_choice?: "auto";
};

function extractTextContent(message: { content?: string | null }): string {
  const content = message.content;
  return content?.trim() ?? "";
}

function searchResultPayload(result: SearchToolResult): string {
  if (result.ok) {
    const payload: SuccessfulSearchPayload = {
      ok: true,
      context: result.context,
    };
    if (result.disableFurtherToolCalls) {
      payload.hint = "Search budget exhausted. Answer without more searches.";
    }
    return JSON.stringify(payload);
  }
  const payload: FailedSearchPayload = {
    ok: false,
    error: result.error,
    hint: result.hint,
  };
  if (result.disableFurtherToolCalls) payload.disableFurtherToolCalls = true;
  return JSON.stringify(payload);
}

export async function runAssistantTurn(input: {
  apiKey: string;
  modelId: string;
  exaApiKey?: string;
  preferFreeSearch?: boolean;
  messages: TurnMessage[];
  signal?: AbortSignal;
}): Promise<string> {
  const runSearch = createSearchExecutor({
    exaApiKey: input.exaApiKey,
    preferFreeSearch: input.preferFreeSearch,
    signal: input.signal,
  });

  const working: TurnMessage[] = [...input.messages];
  let toolsEnabled = true;
  let disableFurtherToolCalls = false;

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    if (input.signal?.aborted) {
      throw new Error("Assistant turn aborted");
    }

    const requestBody: CompletionRequest = {
      model: input.modelId,
      stream: false,
      max_tokens: 2048,
      temperature: 0.7,
      messages: working,
    };
    if (toolsEnabled && !disableFurtherToolCalls) {
      requestBody.tools = [EXA_WEB_SEARCH_TOOL];
      requestBody.tool_choice = "auto";
    }
    const response = await fetch(`${OPENCODE_GO_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${input.apiKey}`,
      },
      signal: input.signal,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`chat completion failed (${response.status}): ${body.slice(0, 300)}`);
    }

    const parsedResponse = safeParse(CompletionResponseSchema, await response.json());
    if (!parsedResponse.success) throw new Error("chat completion returned an invalid response");
    const data = parsedResponse.output;
    const choice = data.choices?.[0];
    const message = choice?.message;
    if (!message) {
      throw new Error("chat completion returned no message");
    }

    const toolCalls = message.tool_calls ?? [];
    if (toolCalls.length > 0) {
      working.push({
        role: "assistant",
        content: message.content ?? null,
        tool_calls: toolCalls,
      });

      for (const toolCall of toolCalls) {
        if (toolCall.function.name !== "exa_web_search") {
          working.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({
              ok: false,
              error: `Unknown tool: ${toolCall.function.name}`,
            }),
          });
          continue;
        }

        let args: SearchArguments = {};
        try {
          const parsedArguments = safeParse(
            SearchArgumentsSchema,
            JSON.parse(toolCall.function.arguments),
          );
          if (parsedArguments.success) args = parsedArguments.output;
        } catch {
          args = {};
        }

        const result = await runSearch(args);
        if (result.disableFurtherToolCalls) {
          disableFurtherToolCalls = true;
        }
        working.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: searchResultPayload(result),
        });
      }
      continue;
    }

    const text = extractTextContent(message);
    if (text) return text;

    if (choice?.finish_reason === "stop") {
      throw new Error("Model stopped without text content");
    }
  }

  throw new Error("Assistant turn exceeded tool iteration limit");
}

export function buildTurnMessages(input: {
  history: Array<{ role: "user" | "assistant"; content: string }>;
  prompt: string;
  searchEnabled: boolean;
}): TurnMessage[] {
  const now = new Date();
  const datePrompt = `Current date: ${now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })}.`;

  const systemParts = [
    "You are a helpful assistant in Discord. Keep replies concise and readable in chat. Use markdown sparingly.",
    datePrompt,
  ];
  if (input.searchEnabled) {
    systemParts.push(SEARCH_SYSTEM_PROMPT);
  }

  return [
    { role: "system", content: systemParts.join("\n\n") },
    ...input.history.map((entry) => ({
      role: entry.role,
      content: entry.content,
    })),
    { role: "user", content: input.prompt },
  ];
}
