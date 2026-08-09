import {
  EXA_WEB_SEARCH_TOOL,
  SEARCH_SYSTEM_PROMPT,
  createSearchExecutor,
  type SearchToolResult,
} from "#/search/tool";

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

type CompletionChoice = {
  message?: {
    content?: string | null;
    tool_calls?: ToolCall[];
  };
  finish_reason?: string;
};

function extractTextContent(message: { content?: string | null }): string {
  const content = message.content;
  if (typeof content === "string") return content.trim();
  return "";
}

function searchResultPayload(result: SearchToolResult): string {
  if (result.ok) {
    return JSON.stringify({
      ok: true,
      context: result.context,
      ...(result.disableFurtherToolCalls
        ? { hint: "Search budget exhausted. Answer without more searches." }
        : {}),
    });
  }
  return JSON.stringify({
    ok: false,
    error: result.error,
    hint: result.hint,
    ...(result.disableFurtherToolCalls ? { disableFurtherToolCalls: true } : {}),
  });
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

    const response = await fetch(`${OPENCODE_GO_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${input.apiKey}`,
      },
      signal: input.signal,
      body: JSON.stringify({
        model: input.modelId,
        stream: false,
        max_tokens: 2048,
        temperature: 0.7,
        messages: working,
        ...(toolsEnabled && !disableFurtherToolCalls
          ? { tools: [EXA_WEB_SEARCH_TOOL], tool_choice: "auto" }
          : {}),
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`chat completion failed (${response.status}): ${body.slice(0, 300)}`);
    }

    const data = (await response.json()) as { choices?: CompletionChoice[] };
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

        let args: { query?: string; numResults?: number } = {};
        try {
          args = JSON.parse(toolCall.function.arguments) as typeof args;
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
