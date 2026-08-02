export interface ModelCapabilitySource {
  attachment?: boolean;
  transport?: "chat-completions" | "responses";
  reasoning?: boolean;
  tool_call?: boolean;
  interleaved?: { field: string } | null;
  modalities?: { input: string[]; output: string[] };
  family?: string;
  limit?: { context?: number; output?: number };
}

export const MODEL_CAPABILITY_REGISTRY: Record<string, ModelCapabilitySource> = {
  "gpt-5.6-luna": {
    attachment: true,
    transport: "responses",
    reasoning: true,
    tool_call: true,
    modalities: { input: ["text", "image", "pdf"], output: ["text"] },
    family: "gpt-luna",
    limit: { context: 1_050_000, output: 128_000 },
  },
  "minimax-m2.7": {
    attachment: false,
    reasoning: true,
    tool_call: true,
    modalities: { input: ["text"], output: ["text"] },
    family: "minimax-m2.7",
    limit: { context: 204800, output: 131072 },
  },
  "minimax-m2.5": {
    attachment: false,
    reasoning: true,
    tool_call: true,
    interleaved: { field: "reasoning_content" },
    modalities: { input: ["text"], output: ["text"] },
    family: "minimax-m2.5",
    limit: { context: 204800, output: 65536 },
  },
  "kimi-k2.6": {
    attachment: true,
    reasoning: true,
    tool_call: true,
    interleaved: { field: "reasoning_content" },
    modalities: { input: ["text", "image", "video"], output: ["text"] },
    family: "kimi-k2.6",
    limit: { context: 262144, output: 65536 },
  },
  "kimi-k2.5": {
    attachment: true,
    reasoning: true,
    tool_call: true,
    interleaved: { field: "reasoning_content" },
    modalities: { input: ["text", "image", "video"], output: ["text"] },
    family: "kimi-k2.5",
    limit: { context: 262144, output: 65536 },
  },
  "kimi-k3": {
    attachment: true,
    reasoning: true,
    tool_call: true,
    interleaved: { field: "reasoning_content" },
    modalities: { input: ["text", "image", "video"], output: ["text"] },
    family: "kimi-k3",
    limit: { context: 1048576, output: 131072 },
  },
  "glm-5.1": {
    attachment: false,
    reasoning: true,
    tool_call: true,
    interleaved: { field: "reasoning_content" },
    modalities: { input: ["text"], output: ["text"] },
    family: "glm",
    limit: { context: 202752, output: 32768 },
  },
  "glm-5": {
    attachment: false,
    reasoning: true,
    tool_call: true,
    interleaved: { field: "reasoning_content" },
    modalities: { input: ["text"], output: ["text"] },
    family: "glm",
    limit: { context: 202752, output: 32768 },
  },
  "deepseek-v4-pro": {
    attachment: false,
    reasoning: true,
    tool_call: true,
    interleaved: { field: "reasoning_content" },
    modalities: { input: ["text"], output: ["text"] },
    family: "deepseek-thinking",
    limit: { context: 1000000, output: 384000 },
  },
  "deepseek-v4-flash": {
    attachment: false,
    reasoning: true,
    tool_call: true,
    interleaved: { field: "reasoning_content" },
    modalities: { input: ["text"], output: ["text"] },
    family: "deepseek-flash",
    limit: { context: 1000000, output: 384000 },
  },
  "qwen3.6-plus": {
    attachment: true,
    reasoning: true,
    tool_call: true,
    modalities: { input: ["text", "image", "video"], output: ["text"] },
    family: "qwen3.6",
    limit: { context: 262144, output: 65536 },
  },
  "qwen3.5-plus": {
    attachment: true,
    reasoning: true,
    tool_call: true,
    modalities: { input: ["text", "image", "video"], output: ["text"] },
    family: "qwen3.5",
    limit: { context: 262144, output: 65536 },
  },
  "mimo-v2-pro": {
    attachment: false,
    reasoning: true,
    tool_call: true,
    interleaved: { field: "reasoning_content" },
    modalities: { input: ["text"], output: ["text"] },
    family: "mimo-v2-pro",
    limit: { context: 1048576, output: 128000 },
  },
  "mimo-v2-omni": {
    attachment: true,
    reasoning: true,
    tool_call: true,
    interleaved: { field: "reasoning_content" },
    modalities: { input: ["text", "image", "audio", "pdf"], output: ["text"] },
    family: "mimo-v2-omni",
    limit: { context: 262144, output: 128000 },
  },
  "mimo-v2.5-pro": {
    attachment: false,
    reasoning: true,
    tool_call: true,
    interleaved: { field: "reasoning_content" },
    modalities: { input: ["text"], output: ["text"] },
    family: "mimo-v2.5-pro",
    limit: { context: 1048576, output: 128000 },
  },
  "mimo-v2.5": {
    attachment: true,
    reasoning: true,
    tool_call: true,
    interleaved: { field: "reasoning_content" },
    modalities: { input: ["text", "image", "audio", "video"], output: ["text"] },
    family: "mimo-v2.5",
    limit: { context: 1000000, output: 128000 },
  },
};

export function modelTransportFor(modelId: string) {
  const catalogModelId = modelId.split("/").pop() ?? modelId;
  return MODEL_CAPABILITY_REGISTRY[catalogModelId]?.transport ?? "chat-completions";
}
