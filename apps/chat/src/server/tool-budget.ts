import { defineChatMiddleware, type ChatMiddleware } from "@tanstack/ai";

export function toolBudgetMiddleware(limits: Readonly<Record<string, number>>): ChatMiddleware {
  const remaining = new Map(
    Object.entries(limits).map(([toolName, limit]) => [toolName, Math.max(0, Math.trunc(limit))]),
  );

  return defineChatMiddleware({
    name: "shedflare-tool-budget",
    onConfig: (_ctx, config) => ({
      tools: config.tools.filter((tool) => (remaining.get(tool.name) ?? 1) > 0),
    }),
    onBeforeToolCall: (_ctx, call) => {
      const available = remaining.get(call.toolName);
      if (available === undefined) return;
      if (available <= 0) {
        return {
          type: "skip",
          result: {
            ok: false,
            error: `The ${call.toolName} call budget is exhausted for this response.`,
            reason: "tool_budget_exhausted",
          },
        };
      }
      remaining.set(call.toolName, available - 1);
    },
  });
}

/**
 * A user-enabled Search toggle is an explicit request for live grounding.
 * Require one tool on the first model pass so provider quirks cannot silently
 * ignore it, then return control to the model for the smallest useful follow-up.
 */
export function liveGroundingMiddleware(): ChatMiddleware {
  return defineChatMiddleware({
    name: "shedflare-live-grounding",
    onConfig: (ctx, config) => {
      if (ctx.phase !== "beforeModel" || config.tools.length === 0) return;
      return {
        modelOptions: {
          ...config.modelOptions,
          tool_choice: ctx.iteration === 0 ? "required" : "auto",
        },
      };
    },
  });
}
