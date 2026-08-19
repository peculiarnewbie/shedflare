import type { ExternalValue } from "#/domain";
import * as Schema from "effect/Schema";

export type AssistantErrorCategory =
  | "cancelled"
  | "timeout"
  | "invalid_request"
  | "auth"
  | "rate_limited"
  | "search"
  | "network"
  | "unknown";

export type AssistantErrorExplanation = {
  title: string;
  summary: string;
  explanation: string;
  details: string;
  retryable: boolean;
  category: AssistantErrorCategory;
  providerMessage: string;
};

export type AssistantErrorFacts = {
  rawMessage: string;
  providerMessage: string;
  statusCode: number | null;
  isCancelled: boolean;
  isTimeout: boolean;
  isReasoningIncompatible: boolean;
  isImageNotSupported: boolean;
  isInvalidRequest: boolean;
  isAuth: boolean;
  isRateLimited: boolean;
  isSearchFailure: boolean;
  isNetworkFailure: boolean;
};

function cleanText(value: string | null | undefined) {
  return String(value ?? "")
    .split("\u0000")
    .join("")
    .trim();
}

function stripCommonWrappers(value: string) {
  return value
    .replace(/^provider returned error:\s*/i, "")
    .replace(/^error:\s*/i, "")
    .trim();
}

function tryParseJsonCandidate(value: string): ExternalValue {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const candidates = [trimmed];
  const objectStart = trimmed.indexOf("{");
  if (objectStart > 0) candidates.push(trimmed.slice(objectStart));
  const arrayStart = trimmed.indexOf("[");
  if (arrayStart > 0) candidates.push(trimmed.slice(arrayStart));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Error strings often contain several non-JSON wrappers before the
      // useful payload. Failed candidates are expected and not actionable.
    }
  }

  return null;
}

function extractDeepMessage(value: ExternalValue, seen = new Set<object>()): string | null {
  if (Schema.is(Schema.String)(value)) {
    const trimmed = stripCommonWrappers(cleanText(value));
    if (!trimmed) return null;
    const parsed = tryParseJsonCandidate(trimmed);
    if (parsed !== null) {
      const nested = extractDeepMessage(parsed, seen);
      if (nested) return nested;
    }
    return trimmed;
  }

  if (Schema.is(Schema.Array(Schema.Any))(value)) {
    if (seen.has(value)) return null;
    seen.add(value);
    for (const item of value) {
      const nested = extractDeepMessage(item, seen);
      if (nested) return nested;
    }
    return null;
  }

  if (!Schema.is(Schema.Record(Schema.String, Schema.Any))(value)) return null;
  const record = value;
  if (seen.has(record)) return null;
  seen.add(record);
  const preferredKeys = [
    "error",
    "message",
    "detail",
    "details",
    "metadata",
    "raw",
    "body",
    "response",
  ];

  for (const key of preferredKeys) {
    if (!(key in record)) continue;
    const nested = extractDeepMessage(record[key], seen);
    if (nested) return nested;
  }

  for (const nestedValue of Object.values(record)) {
    const nested = extractDeepMessage(nestedValue, seen);
    if (nested) return nested;
  }

  return null;
}

function detectStatusCode(rawMessage: string, providerMessage: string) {
  const match = `${rawMessage}\n${providerMessage}`.match(/\bHTTP\s+(\d{3})\b/i);
  return match ? Number(match[1]) : null;
}

export function extractAssistantErrorFacts(
  errorCode: string | null | undefined,
  errorMessage: string | null | undefined,
): AssistantErrorFacts {
  const rawMessage = cleanText(errorMessage) || "Unknown error";
  const providerMessage = extractDeepMessage(rawMessage) ?? rawMessage;
  const statusCode = detectStatusCode(rawMessage, providerMessage);
  const haystack = `${errorCode ?? ""}\n${rawMessage}\n${providerMessage}`.toLowerCase();

  return {
    rawMessage,
    providerMessage,
    statusCode,
    isCancelled: errorCode === "cancelled",
    isTimeout: /timed out|timeout|deadline exceeded|request timeout|stream timeout|etimedout/.test(
      haystack,
    ),
    isReasoningIncompatible:
      /reasoning_content is missing|thinking is enabled but reasoning_content is missing/.test(
        haystack,
      ),
    isImageNotSupported:
      /image_url.*not.*support|does not support.*(image|vision|multimodal)|unsupported.*image|image.*unsupported|content.*type.*image.*reject|image.*not.*(allowed|permitted|available)|multimodal.*not|not.*multimodal|No endpoints found that support image input/.test(
        haystack,
      ),
    isInvalidRequest:
      statusCode === 400 ||
      /invalid request|unsupported field|unsupported parameter|unsupported option|missing required|bad request|invalid value|invalid parameter/.test(
        haystack,
      ),
    isAuth:
      statusCode === 401 ||
      statusCode === 403 ||
      /unauthorized|forbidden|invalid api key|api key|permission denied|quota|billing|insufficient_quota|account restricted|account suspended/.test(
        haystack,
      ),
    isRateLimited:
      statusCode === 429 ||
      statusCode === 503 ||
      /rate limit|too many requests|overloaded|overload|server busy|temporarily unavailable|service unavailable/.test(
        haystack,
      ),
    isSearchFailure:
      errorCode === "search_failed" ||
      /search failed|exa_web_search|tool execution|tool call|tool use|tool flow/.test(haystack),
    isNetworkFailure:
      /failed to fetch|fetch failed|network|connection reset|connection error|socket hang up|econnreset|enotfound|eai_again|tls|upstream connect|could not connect/.test(
        haystack,
      ),
  };
}

const ERROR_EXPLANATIONS: Array<{
  check: (f: AssistantErrorFacts) => boolean;
  summary: string;
  explanation: string;
  retryable: boolean;
  category: AssistantErrorCategory;
}> = [
  {
    check: (f) => f.isCancelled,
    summary: "The request was cancelled.",
    explanation: "The response stopped before the assistant finished generating an answer.",
    retryable: true,
    category: "cancelled",
  },
  {
    check: (f) => f.isImageNotSupported,
    summary: "This model doesn't support image uploads.",
    explanation:
      "The selected model received one or more images as part of the request, but this model only accepts text. Remove the images from the message or switch to a model that supports vision.",
    retryable: false,
    category: "invalid_request",
  },
  {
    check: (f) => f.isReasoningIncompatible,
    summary: "This model's thinking mode is incompatible with tool use in this flow.",
    explanation:
      "The provider rejected the tool continuation because it said the required hidden reasoning replay field was missing. This app does attempt to preserve that field now, so this usually points to a provider incompatibility or an unsupported response shape.",
    retryable: false,
    category: "invalid_request",
  },
  {
    check: (f) => f.isTimeout,
    summary: "The model backend took too long to respond.",
    explanation:
      "The upstream model service did not finish the request within the timeout window. Retrying usually works if the provider is healthy.",
    retryable: true,
    category: "timeout",
  },
  {
    check: (f) => f.isInvalidRequest,
    summary: "The model provider rejected this request.",
    explanation:
      "The provider reported that this request shape or option combination was invalid, unsupported, or incomplete.",
    retryable: false,
    category: "invalid_request",
  },
  {
    check: (f) => f.isAuth,
    summary: "The provider account could not complete this request.",
    explanation:
      "The configured provider credentials, billing state, or account permissions blocked the request.",
    retryable: false,
    category: "auth",
  },
  {
    check: (f) => f.isRateLimited,
    summary: "The provider is rate limited or temporarily overloaded.",
    explanation:
      "The upstream model service could not accept this request right now. Waiting and retrying usually resolves it.",
    retryable: true,
    category: "rate_limited",
  },
  {
    check: (f) => f.isSearchFailure,
    summary: "A tool or search step failed before the response could complete.",
    explanation:
      "The assistant started a tool-enabled turn, but one of the external steps failed and the response could not finish cleanly.",
    retryable: true,
    category: "search",
  },
  {
    check: (f) => f.isNetworkFailure,
    summary: "The app could not reach the model provider.",
    explanation:
      "The request appears to have failed in transit or during upstream connectivity, before the provider returned a normal response.",
    retryable: true,
    category: "network",
  },
];

export function explainAssistantError(input: {
  errorCode: string | null | undefined;
  errorMessage: string | null | undefined;
}): AssistantErrorExplanation {
  const facts = extractAssistantErrorFacts(input.errorCode, input.errorMessage);
  const match = ERROR_EXPLANATIONS.find((e) => e.check(facts));
  return {
    title: "Response failed",
    summary: match?.summary ?? "The assistant ran into an unexpected error.",
    explanation:
      match?.explanation ??
      "The request failed for a reason the app could not classify more specifically. The technical details below preserve the provider response for debugging.",
    details: facts.rawMessage,
    retryable: match?.retryable ?? true,
    category: match?.category ?? "unknown",
    providerMessage: facts.providerMessage,
  };
}
