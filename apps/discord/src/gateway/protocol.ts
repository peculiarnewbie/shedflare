/** Discord Gateway API version used for WebSocket connections. */
export const GATEWAY_VERSION = 10;

export const GATEWAY_BOT_URL = "https://discord.com/api/v10/gateway/bot";

export const DISCORD_API_BASE = "https://discord.com/api/v10";

/** Header the Gateway DO sets when POSTing events to the worker. */
export const GATEWAY_WEBHOOK_HEADER = "x-shedflare-discord-gateway";

/**
 * Intents required for @mention handling in guilds and DMs.
 * GUILD_MESSAGES + DIRECT_MESSAGES + MESSAGE_CONTENT (privileged).
 */
export const GATEWAY_INTENTS = (1 << 9) | (1 << 12) | (1 << 15);

export const GatewayOpcode = {
  Dispatch: 0,
  Heartbeat: 1,
  Identify: 2,
  Resume: 6,
  Reconnect: 7,
  InvalidSession: 9,
  Hello: 10,
  HeartbeatAck: 11,
} as const;

/** Only MESSAGE_CREATE is forwarded — enough for @mention bots. */
export const FORWARDED_DISPATCH_EVENTS = new Set(["MESSAGE_CREATE"]);

export const NON_RECONNECTABLE_CLOSE_CODES = new Set([4004, 4010, 4011, 4012, 4013, 4014]);

export const NON_RESUMABLE_CLOSE_CODES = new Set([4003, 4007, 4009]);

export const MAX_BACKOFF_MS = 300_000;
export const INTERNAL_RECONNECT_CLOSE_CODE = 3001;
export const WEBHOOK_MAX_ATTEMPTS = 2;
export const WEBHOOK_RETRY_DELAY_MS = 1_000;
export const ALARM_FALLBACK_DELAY_MS = 30_000;

export type ReconnectStrategy = "resume-or-identify" | "identify-only";

export type GatewayCredentials = {
  botToken: string;
  webhookUrl: string;
  webhookSecret: string;
};

export type StoredCredentials = GatewayCredentials;

export type GatewayState = {
  wsUrl: string | null;
  resumeGatewayUrl: string | null;
  sessionId: string | null;
  sequence: number | null;
  heartbeatIntervalMs: number | null;
  lastHeartbeatAck: number | null;
  connectedAt: string | null;
  botUserId: string | null;
  reconnectAttempts: number;
  reconnectStrategy: ReconnectStrategy;
  identifyCooldownUntil: number | null;
  sessionStartRemaining: number | null;
  sessionStartResetAfterMs: number | null;
  reconnectDisabled: boolean;
};

export type GatewayStatus = {
  status: "connected" | "connecting" | "disconnected";
  sessionId: string | null;
  connectedAt: string | null;
  sequence: number | null;
  botUserId: string | null;
  reconnectAttempts: number;
  reconnectDisabled: boolean;
};

export type GatewayBotResponse = {
  url: string;
  session_start_limit?: {
    total: number;
    remaining: number;
    reset_after: number;
    max_concurrency: number;
  };
};

export type GatewayHello = {
  op: typeof GatewayOpcode.Hello;
  d: { heartbeat_interval: number };
};

export type GatewayDispatch = {
  op: typeof GatewayOpcode.Dispatch;
  t: string;
  s: number;
  d: unknown;
};

export type GatewayReady = {
  op: typeof GatewayOpcode.Dispatch;
  t: "READY";
  s: number;
  d: {
    session_id: string;
    resume_gateway_url?: string;
    user: { id: string; username: string };
  };
};

export type GatewayInvalidSession = {
  op: typeof GatewayOpcode.InvalidSession;
  d: boolean;
};

/** Payload POSTed from the Gateway DO to the worker. */
export type GatewayWebhookEvent = {
  type: "MESSAGE_CREATE";
  timestamp: number;
  botUserId: string | null;
  data: unknown;
};

export function emptyGatewayState(): GatewayState {
  return {
    wsUrl: null,
    resumeGatewayUrl: null,
    sessionId: null,
    sequence: null,
    heartbeatIntervalMs: null,
    lastHeartbeatAck: null,
    connectedAt: null,
    botUserId: null,
    reconnectAttempts: 0,
    reconnectStrategy: "resume-or-identify",
    identifyCooldownUntil: null,
    sessionStartRemaining: null,
    sessionStartResetAfterMs: null,
    reconnectDisabled: false,
  };
}

export function normalizeGatewayState(state: Partial<GatewayState>): GatewayState {
  return {
    ...emptyGatewayState(),
    ...state,
    reconnectAttempts: state.reconnectAttempts ?? 0,
    reconnectStrategy: state.reconnectStrategy ?? "resume-or-identify",
    reconnectDisabled: state.reconnectDisabled ?? false,
  };
}

export function canResumeGateway(state: GatewayState): boolean {
  return (
    state.reconnectStrategy !== "identify-only" && !!state.sessionId && state.sequence !== null
  );
}

export function classifyGatewayClose(code: number): {
  shouldReconnect: boolean;
  canResume: boolean;
} {
  const shouldReconnect = !NON_RECONNECTABLE_CLOSE_CODES.has(code);
  const canResume = shouldReconnect && !NON_RESUMABLE_CLOSE_CODES.has(code);
  return { shouldReconnect, canResume };
}

export function toHttpWebSocketUrl(url: string): string {
  if (url.startsWith("wss://")) return `https://${url.slice(6)}`;
  if (url.startsWith("ws://")) return `http://${url.slice(5)}`;
  return url;
}

export function isPublicWebhookHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".localhost") || lower.endsWith(".local")) {
    return false;
  }

  const ipv4 = lower.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    return !(
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }

  if (lower === "::1" || lower === "::") return false;
  if (/^f[c-d]/i.test(lower) || /^fe[89ab]/i.test(lower)) return false;
  return true;
}
