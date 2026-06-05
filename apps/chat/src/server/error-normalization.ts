import { extractAssistantErrorFacts, type AssistantErrorFacts } from "../lib/assistant-errors";

export type NormalizedAssistantError = {
  errorCode: string;
  errorMessage: string;
  providerName: string | null;
  retryable: boolean;
};

const PROVIDER_KEYWORDS: [string, string][] = [
  ["moonshot", "moonshot"],
  ["kimi", "moonshot"],
  ["openai", "openai"],
  ["groq", "groq"],
  ["anthropic", "anthropic"],
];

function inferProviderName(modelId: string | null | undefined, errorMessage: string) {
  const providerPrefix = String(modelId ?? "")
    .split("/")[0]
    ?.trim();
  if (providerPrefix) return providerPrefix;

  const message = errorMessage.toLowerCase();
  for (const [keyword, name] of PROVIDER_KEYWORDS) {
    if (message.includes(keyword)) return name;
  }
  return null;
}

const ERROR_NORMALIZERS: Array<{
  check: (f: AssistantErrorFacts) => boolean;
  errorCode: string;
  retryable: boolean;
}> = [
  { check: (f) => f.isCancelled, errorCode: "cancelled", retryable: true },
  {
    check: (f) => f.isImageNotSupported,
    errorCode: "provider_image_not_supported",
    retryable: false,
  },
  {
    check: (f) => f.isReasoningIncompatible,
    errorCode: "provider_reasoning_incompatible",
    retryable: false,
  },
  { check: (f) => f.isTimeout, errorCode: "assistant_timeout", retryable: true },
  { check: (f) => f.isInvalidRequest, errorCode: "provider_invalid_request", retryable: false },
  { check: (f) => f.isAuth, errorCode: "provider_auth", retryable: false },
  { check: (f) => f.isRateLimited, errorCode: "provider_rate_limited", retryable: true },
  { check: (f) => f.isSearchFailure, errorCode: "search_failed", retryable: true },
];

export function normalizeAssistantError(input: {
  errorCode?: string | null;
  errorMessage?: string | null;
  modelId?: string | null;
}): NormalizedAssistantError {
  const facts = extractAssistantErrorFacts(input.errorCode, input.errorMessage);
  const providerName = inferProviderName(input.modelId, facts.rawMessage);
  const match = ERROR_NORMALIZERS.find((n) => n.check(facts));
  if (match) {
    return {
      errorCode: match.errorCode,
      errorMessage: facts.rawMessage,
      providerName,
      retryable: match.retryable,
    };
  }
  return {
    errorCode: input.errorCode || "assistant_turn_error",
    errorMessage: facts.rawMessage,
    providerName,
    retryable: facts.isNetworkFailure || facts.statusCode == null,
  };
}
