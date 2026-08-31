import type { ReasoningLevel } from "#/domain";

export function getTitleGenerationModelOptions(modelInterleavedField?: string | null) {
  if (modelInterleavedField === "reasoning_content") {
    return { thinking: { type: "disabled" as const } };
  }
  return {};
}

export function getProviderModelOptions(
  modelId: string,
  reasoningLevel: ReasoningLevel,
  modelInterleavedField?: string | null,
) {
  const provider = modelId.split("/")[0]?.toLowerCase() ?? "";
  const effectiveReasoningLevel = reasoningLevel;
  const overrideReason: string | null = null;

  // Models with interleaved thinking (e.g., Kimi K2.5) use reasoning_content field.
  //
  // OpenCode's interleaved-thinking models use this provider-specific option.
  // TanStack AI owns preservation of the assistant/tool continuation state.
  if (modelInterleavedField === "reasoning_content") {
    return {
      effectiveReasoningLevel,
      overrideReason,
      modelOptions: {
        thinking: {
          type: effectiveReasoningLevel === "off" ? "disabled" : "enabled",
        },
      },
    };
  }

  if (provider === "openai") {
    return {
      effectiveReasoningLevel,
      overrideReason,
      modelOptions: {
        reasoning: {
          effort: effectiveReasoningLevel === "off" ? "none" : effectiveReasoningLevel,
        },
      },
    };
  }

  if (provider === "groq") {
    return {
      effectiveReasoningLevel,
      overrideReason,
      modelOptions: {
        reasoning_effort: effectiveReasoningLevel === "off" ? "none" : effectiveReasoningLevel,
      },
    };
  }

  return {
    effectiveReasoningLevel,
    overrideReason,
    modelOptions: undefined,
  };
}
