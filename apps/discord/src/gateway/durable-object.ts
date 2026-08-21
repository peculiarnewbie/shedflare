import { DurableObject } from "cloudflare:workers";
import { parse } from "valibot";
import {
  ALARM_FALLBACK_DELAY_MS,
  FORWARDED_DISPATCH_EVENTS,
  GATEWAY_BOT_URL,
  GATEWAY_INTENTS,
  GATEWAY_VERSION,
  GatewayBotResponseSchema,
  GatewayDispatchSchema,
  GatewayHelloSchema,
  GatewayInvalidSessionSchema,
  GatewayOpcode,
  GatewayPayloadSchema,
  GatewayReadySchema,
  INTERNAL_RECONNECT_CLOSE_CODE,
  MAX_BACKOFF_MS,
  WEBHOOK_MAX_ATTEMPTS,
  WEBHOOK_RETRY_DELAY_MS,
  canResumeGateway,
  classifyGatewayClose,
  isPublicWebhookHostname,
  normalizeGatewayState,
  toHttpWebSocketUrl,
  type GatewayCredentials,
  type GatewayDispatch,
  type GatewayHello,
  type GatewayInvalidSession,
  type GatewayState,
  type GatewayStatus,
  type GatewayWebhookEvent,
  type ReconnectStrategy,
  type StoredCredentials,
} from "#/gateway/protocol";

const STATE_KEY = "gateway_state";
const CREDENTIALS_KEY = "gateway_credentials";

type ConnectResult = { ok: true } | { ok: false; error: string; retryScheduled: boolean };

/**
 * Maintains a persistent Discord Gateway WebSocket inside a Durable Object.
 * Forwards MESSAGE_CREATE dispatches to the worker over HTTPS so @mentions
 * work without discord.js or an external always-on process.
 */
export class DiscordGatewayDurableObject extends DurableObject {
  private upstream: WebSocket | null = null;
  private suppressReconnect = false;
  private reconnectPlanned = false;
  private reconnectDisabled = false;
  private cachedCredentials: StoredCredentials | null = null;
  private messageQueue: Promise<void> = Promise.resolve();

  async startGateway(
    credentials: GatewayCredentials,
  ): Promise<{ status: "connecting" } | { error: string }> {
    if (!credentials.botToken?.trim() || !credentials.webhookUrl?.trim()) {
      return { error: "botToken and webhookUrl are required" };
    }
    if (!credentials.webhookSecret?.trim()) {
      return { error: "webhookSecret is required" };
    }

    try {
      const parsed = new URL(credentials.webhookUrl);
      if (parsed.protocol !== "https:") return { error: "webhookUrl must use HTTPS" };
      if (parsed.username || parsed.password) {
        return { error: "webhookUrl must not contain credentials" };
      }
      if (!isPublicWebhookHostname(parsed.hostname)) {
        return { error: "webhookUrl host must be publicly routable" };
      }
    } catch {
      return { error: "webhookUrl must be a valid URL" };
    }

    const stored: StoredCredentials = {
      botToken: credentials.botToken.trim(),
      webhookUrl: credentials.webhookUrl.trim(),
      webhookSecret: credentials.webhookSecret.trim(),
    };
    await this.ctx.storage.put(CREDENTIALS_KEY, stored);
    this.cachedCredentials = stored;

    const state = normalizeGatewayState((await this.loadState()) ?? {});
    state.reconnectDisabled = false;
    await this.saveState(state);
    this.reconnectDisabled = false;

    const result = await this.connectInternal();
    if (!result.ok && !result.retryScheduled) {
      return { error: result.error };
    }
    return { status: "connecting" };
  }

  async disconnect(): Promise<{ status: "disconnected" }> {
    await this.disconnectInternal();
    await this.ctx.storage.delete(CREDENTIALS_KEY);
    this.cachedCredentials = null;
    return { status: "disconnected" };
  }

  async status(): Promise<GatewayStatus> {
    const state = await this.loadState();
    return {
      status: this.upstream ? "connected" : state?.wsUrl ? "connecting" : "disconnected",
      sessionId: state?.sessionId ?? null,
      connectedAt: state?.connectedAt ?? null,
      sequence: state?.sequence ?? null,
      botUserId: state?.botUserId ?? null,
      reconnectAttempts: state?.reconnectAttempts ?? 0,
      reconnectDisabled: state?.reconnectDisabled ?? false,
    };
  }

  async alarm(): Promise<void> {
    try {
      await this.alarmInternal();
    } catch (error) {
      console.error("[discord-gateway] alarm failed", error);
      await this.ctx.storage.setAlarm(Date.now() + ALARM_FALLBACK_DELAY_MS);
    }
  }

  private async alarmInternal(): Promise<void> {
    if (this.reconnectDisabled) return;

    const state = await this.loadState();
    if (!state) {
      if (await this.loadCredentials()) await this.connectInternal();
      return;
    }

    if (state.reconnectDisabled) {
      this.reconnectDisabled = true;
      await this.ctx.storage.deleteAlarm();
      return;
    }

    if (state.identifyCooldownUntil && Date.now() < state.identifyCooldownUntil) {
      await this.ctx.storage.setAlarm(state.identifyCooldownUntil);
      return;
    }

    if (!state.wsUrl) {
      await this.connectInternal();
      return;
    }

    if (!this.upstream) {
      state.wsUrl = null;
      state.heartbeatIntervalMs = null;
      await this.saveState(state);
      await this.connectInternal();
      return;
    }

    if (!state.heartbeatIntervalMs) {
      await this.identifyOrResume(state);
      return;
    }

    const now = Date.now();
    const lastAck = state.lastHeartbeatAck ?? 0;
    if (now - lastAck > state.heartbeatIntervalMs * 2) {
      console.warn("[discord-gateway] heartbeat missed; reconnecting");
      await this.reconnectWithBackoff();
      return;
    }

    this.sendHeartbeat(state);
    await this.scheduleHeartbeat(state);
  }

  private async connectInternal(): Promise<ConnectResult> {
    const state = normalizeGatewayState((await this.loadState()) ?? {});
    if (this.upstream) return { ok: true };

    if (state.reconnectDisabled) {
      return {
        ok: false,
        error: "reconnect disabled after terminal close code",
        retryScheduled: false,
      };
    }

    const creds = await this.loadCredentials();
    if (!creds) {
      return { ok: false, error: "no credentials stored", retryScheduled: false };
    }

    const resumable = canResumeGateway(state);
    let gatewayUrl = resumable ? (state.resumeGatewayUrl ?? state.wsUrl) : state.wsUrl;

    if (!gatewayUrl) {
      const info = await this.fetchGatewayInfo(creds.botToken);
      if (!info.ok) {
        if (info.retryable) {
          await this.reconnectWithBackoff({ reason: info.error });
          return { ok: false, error: info.error, retryScheduled: true };
        }
        return { ok: false, error: info.error, retryScheduled: false };
      }
      gatewayUrl = info.url;
      if (info.sessionStartLimit) {
        state.sessionStartRemaining = info.sessionStartLimit.remaining;
        state.sessionStartResetAfterMs = info.sessionStartLimit.reset_after;
      }
    }

    if (!canResumeGateway(state)) {
      const now = Date.now();
      if (state.identifyCooldownUntil && now < state.identifyCooldownUntil) {
        await this.ctx.storage.setAlarm(state.identifyCooldownUntil);
        return { ok: false, error: "identify cooldown active", retryScheduled: true };
      }
      if (
        state.sessionStartRemaining !== null &&
        state.sessionStartRemaining <= 0 &&
        state.sessionStartResetAfterMs
      ) {
        state.identifyCooldownUntil = now + state.sessionStartResetAfterMs;
        state.wsUrl = null;
        await this.saveState(state);
        await this.ctx.storage.setAlarm(state.identifyCooldownUntil);
        return {
          ok: false,
          error: "session start limit exhausted",
          retryScheduled: true,
        };
      }
    }

    state.wsUrl = gatewayUrl;
    state.heartbeatIntervalMs = null;
    state.lastHeartbeatAck = Date.now();
    state.connectedAt = new Date().toISOString();
    state.reconnectDisabled = false;
    await this.saveState(state);

    const opened = await this.openWebSocket(gatewayUrl);
    if (!opened.ok) {
      if (opened.retryable) {
        await this.reconnectWithBackoff({ reason: opened.error });
      } else {
        state.wsUrl = null;
        await this.saveState(state);
      }
      return {
        ok: false,
        error: opened.error,
        retryScheduled: opened.retryable,
      };
    }

    return { ok: true };
  }

  private async disconnectInternal(): Promise<void> {
    if (this.upstream) {
      this.suppressReconnect = true;
      try {
        this.upstream.close(1000, "client disconnect");
      } catch {
        /* already closed */
      }
      this.upstream = null;
    }
    await this.ctx.storage.delete(STATE_KEY);
    this.reconnectDisabled = false;
    await this.ctx.storage.deleteAlarm();
  }

  private async reconnectWithBackoff(options?: {
    strategy?: ReconnectStrategy;
    clearSession?: boolean;
    reason?: string;
  }): Promise<void> {
    const state = normalizeGatewayState((await this.loadState()) ?? {});
    const attempts = state.reconnectAttempts + 1;
    const delay = Math.min(1000 * 2 ** attempts, MAX_BACKOFF_MS) + Math.random() * 1000;

    state.reconnectAttempts = attempts;
    state.wsUrl = null;
    state.heartbeatIntervalMs = null;
    state.reconnectStrategy = options?.strategy ?? state.reconnectStrategy;
    if (options?.clearSession) {
      state.sessionId = null;
      state.sequence = null;
    }
    await this.saveState(state);

    if (this.upstream) {
      this.reconnectPlanned = true;
      try {
        this.upstream.close(INTERNAL_RECONNECT_CLOSE_CODE, "reconnecting");
      } catch {
        /* already closed */
      }
      this.upstream = null;
    }

    console.warn("[discord-gateway] scheduling reconnect", {
      attempts,
      delayMs: Math.round(delay),
      reason: options?.reason,
    });
    await this.ctx.storage.setAlarm(Date.now() + delay);
  }

  private async reconnectSoon(options?: {
    strategy?: ReconnectStrategy;
    clearSession?: boolean;
  }): Promise<void> {
    const state = normalizeGatewayState((await this.loadState()) ?? {});
    state.wsUrl = null;
    state.heartbeatIntervalMs = null;
    state.reconnectStrategy = options?.strategy ?? state.reconnectStrategy;
    if (options?.clearSession) {
      state.sessionId = null;
      state.sequence = null;
    }
    await this.saveState(state);

    if (this.upstream) {
      this.reconnectPlanned = true;
      try {
        this.upstream.close(INTERNAL_RECONNECT_CLOSE_CODE, "reconnecting");
      } catch {
        /* already closed */
      }
      this.upstream = null;
    }

    await this.ctx.storage.setAlarm(Date.now() + 1000);
  }

  private async openWebSocket(
    url: string,
  ): Promise<{ ok: true } | { ok: false; error: string; retryable: boolean }> {
    const wsUrl = `${toHttpWebSocketUrl(url)}?v=${GATEWAY_VERSION}&encoding=json`;

    let response: Response;
    try {
      response = await fetch(wsUrl, { headers: { Upgrade: "websocket" } });
    } catch (error) {
      return {
        ok: false,
        error: `websocket upgrade failed: ${String(error)}`,
        retryable: true,
      };
    }

    if (!response.webSocket) {
      const retryable = response.status === 429 || response.status >= 500 || response.status === 0;
      return {
        ok: false,
        error: `websocket upgrade rejected (${response.status})`,
        retryable,
      };
    }

    const ws = response.webSocket;
    ws.accept();
    this.upstream = ws;
    this.suppressReconnect = false;
    this.reconnectPlanned = false;

    ws.addEventListener("message", (evt) => {
      if (this.upstream !== ws) return;
      this.messageQueue = this.messageQueue
        .then(() => this.handleGatewayMessage(String(evt.data)))
        .catch((error) => console.error("[discord-gateway] message handler error", error));
    });

    ws.addEventListener("close", (evt) => {
      if (this.upstream !== ws) return;
      this.upstream = null;

      if (this.suppressReconnect) {
        this.suppressReconnect = false;
        return;
      }
      if (this.reconnectPlanned) {
        this.reconnectPlanned = false;
        return;
      }

      const policy = classifyGatewayClose(evt.code);
      if (!policy.shouldReconnect) {
        this.reconnectDisabled = true;
        void this.stopReconnecting(evt.code);
        return;
      }

      void this.reconnectWithBackoff({
        strategy: policy.canResume ? "resume-or-identify" : "identify-only",
        clearSession: !policy.canResume,
        reason: `close ${evt.code}`,
      });
    });

    ws.addEventListener("error", () => {
      if (this.upstream !== ws) return;
      this.upstream = null;
      if (this.suppressReconnect || this.reconnectPlanned) return;
      void this.reconnectWithBackoff({ reason: "websocket error" });
    });

    return { ok: true };
  }

  private async handleGatewayMessage(raw: string): Promise<void> {
    let payload;
    try {
      payload = parse(GatewayPayloadSchema, JSON.parse(raw));
    } catch {
      return;
    }

    const state = normalizeGatewayState((await this.loadState()) ?? {});
    if (payload.s != null) {
      state.sequence = payload.s;
      await this.saveState(state);
    }

    switch (payload.op) {
      case GatewayOpcode.Hello:
        await this.handleHello(parse(GatewayHelloSchema, payload), state);
        break;
      case GatewayOpcode.Dispatch:
        await this.handleDispatch(parse(GatewayDispatchSchema, payload), state);
        break;
      case GatewayOpcode.Heartbeat:
        this.sendHeartbeat(state);
        break;
      case GatewayOpcode.HeartbeatAck:
        state.lastHeartbeatAck = Date.now();
        await this.saveState(state);
        break;
      case GatewayOpcode.Reconnect:
        await this.reconnectSoon({ strategy: "resume-or-identify" });
        break;
      case GatewayOpcode.InvalidSession:
        await this.handleInvalidSession(parse(GatewayInvalidSessionSchema, payload), state);
        break;
    }
  }

  private async handleHello(payload: GatewayHello, state: GatewayState): Promise<void> {
    state.heartbeatIntervalMs = payload.d.heartbeat_interval;
    state.lastHeartbeatAck = Date.now();
    await this.saveState(state);
    await this.identifyOrResume(state);
    const firstDelay = Math.floor(payload.d.heartbeat_interval * Math.random());
    await this.ctx.storage.setAlarm(Date.now() + firstDelay);
  }

  private async handleDispatch(payload: GatewayDispatch, state: GatewayState): Promise<void> {
    if (payload.t === "READY") {
      const ready = parse(GatewayReadySchema, payload);
      state.sessionId = ready.d.session_id;
      state.resumeGatewayUrl = ready.d.resume_gateway_url ?? state.resumeGatewayUrl;
      state.botUserId = ready.d.user.id;
      state.reconnectAttempts = 0;
      state.reconnectStrategy = "resume-or-identify";
      state.identifyCooldownUntil = null;
      state.reconnectDisabled = false;
      await this.saveState(state);
      console.log("[discord-gateway] READY", { user: ready.d.user.username });
      return;
    }

    if (payload.t === "RESUMED") {
      state.reconnectAttempts = 0;
      state.reconnectStrategy = "resume-or-identify";
      await this.saveState(state);
      return;
    }

    if (FORWARDED_DISPATCH_EVENTS.has(payload.t)) {
      await this.forwardEvent(payload.t, payload.d, state.botUserId);
    }
  }

  private async handleInvalidSession(
    payload: GatewayInvalidSession,
    state: GatewayState,
  ): Promise<void> {
    state.reconnectStrategy = payload.d ? "resume-or-identify" : "identify-only";
    if (!payload.d) {
      state.sessionId = null;
      state.sequence = null;
    }
    state.wsUrl = null;
    state.heartbeatIntervalMs = null;
    await this.saveState(state);

    if (this.upstream) {
      this.reconnectPlanned = true;
      try {
        this.upstream.close(INTERNAL_RECONNECT_CLOSE_CODE, "invalid session");
      } catch {
        /* already closed */
      }
      this.upstream = null;
    }

    const delay = 1000 + Math.random() * 4000;
    await this.ctx.storage.setAlarm(Date.now() + delay);
  }

  private async identifyOrResume(state: GatewayState): Promise<void> {
    const ws = this.upstream;
    if (!ws) return;

    const creds = await this.loadCredentials();
    if (!creds) return;

    if (canResumeGateway(state)) {
      ws.send(
        JSON.stringify({
          op: GatewayOpcode.Resume,
          d: {
            token: creds.botToken,
            session_id: state.sessionId,
            seq: state.sequence,
          },
        }),
      );
      return;
    }

    const now = Date.now();
    if (state.identifyCooldownUntil && now < state.identifyCooldownUntil) {
      await this.ctx.storage.setAlarm(state.identifyCooldownUntil);
      return;
    }
    if (
      state.sessionStartRemaining !== null &&
      state.sessionStartRemaining <= 0 &&
      state.sessionStartResetAfterMs
    ) {
      state.identifyCooldownUntil = now + state.sessionStartResetAfterMs;
      state.wsUrl = null;
      await this.saveState(state);
      await this.ctx.storage.setAlarm(state.identifyCooldownUntil);
      return;
    }

    ws.send(
      JSON.stringify({
        op: GatewayOpcode.Identify,
        d: {
          token: creds.botToken,
          intents: GATEWAY_INTENTS,
          properties: {
            os: "cloudflare",
            browser: "shedflare-discord",
            device: "shedflare-discord",
          },
        },
      }),
    );

    if (state.sessionStartRemaining !== null && state.sessionStartRemaining > 0) {
      state.sessionStartRemaining -= 1;
    }
    state.identifyCooldownUntil = null;
    state.reconnectStrategy = "resume-or-identify";
    await this.saveState(state);
  }

  private sendHeartbeat(state: GatewayState): void {
    const ws = this.upstream;
    if (!ws) return;
    ws.send(JSON.stringify({ op: GatewayOpcode.Heartbeat, d: state.sequence }));
  }

  private async scheduleHeartbeat(state: GatewayState): Promise<void> {
    if (!state.heartbeatIntervalMs) return;
    await this.ctx.storage.setAlarm(Date.now() + state.heartbeatIntervalMs);
  }

  private async forwardEvent(
    eventType: string,
    data: GatewayDispatch["d"],
    botUserId: string | null,
  ): Promise<void> {
    const creds = await this.loadCredentials();
    if (!creds) return;

    const event: GatewayWebhookEvent = {
      type: "MESSAGE_CREATE",
      timestamp: Date.now(),
      botUserId,
      data,
    };

    for (let attempt = 0; attempt < WEBHOOK_MAX_ATTEMPTS; attempt++) {
      try {
        const response = await fetch(creds.webhookUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-shedflare-discord-gateway": creds.webhookSecret,
          },
          body: JSON.stringify(event),
        });
        if (response.ok) return;
        if (response.status >= 400 && response.status < 500) return;
      } catch (error) {
        console.error("[discord-gateway] webhook forward error", error);
      }
      if (attempt < WEBHOOK_MAX_ATTEMPTS - 1) {
        await scheduler.wait(WEBHOOK_RETRY_DELAY_MS);
      }
    }
  }

  private async fetchGatewayInfo(botToken: string): Promise<
    | {
        ok: true;
        url: string;
        sessionStartLimit?: { remaining: number; reset_after: number };
      }
    | { ok: false; error: string; retryable: boolean }
  > {
    try {
      const response = await fetch(GATEWAY_BOT_URL, {
        headers: { Authorization: `Bot ${botToken}` },
      });
      if (!response.ok) {
        return {
          ok: false,
          error: `GET /gateway/bot failed (${response.status})`,
          retryable: response.status === 429 || response.status >= 500,
        };
      }
      const data = parse(GatewayBotResponseSchema, await response.json());
      return { ok: true, url: data.url, sessionStartLimit: data.session_start_limit };
    } catch (error) {
      return {
        ok: false,
        error: `gateway bot request failed: ${String(error)}`,
        retryable: true,
      };
    }
  }

  private async stopReconnecting(code: number): Promise<void> {
    const state = normalizeGatewayState((await this.loadState()) ?? {});
    this.reconnectDisabled = true;
    state.wsUrl = null;
    state.heartbeatIntervalMs = null;
    state.reconnectDisabled = true;
    await this.saveState(state);
    await this.ctx.storage.deleteAlarm();
    console.error("[discord-gateway] stopped reconnecting", { code });
  }

  private async loadCredentials(): Promise<StoredCredentials | null> {
    if (this.cachedCredentials) return this.cachedCredentials;
    const creds = await this.ctx.storage.get<StoredCredentials>(CREDENTIALS_KEY);
    this.cachedCredentials = creds ?? null;
    return this.cachedCredentials;
  }

  private async loadState(): Promise<GatewayState | null> {
    const state = await this.ctx.storage.get<Partial<GatewayState>>(STATE_KEY);
    return state ? normalizeGatewayState(state) : null;
  }

  private async saveState(state: GatewayState): Promise<void> {
    await this.ctx.storage.put(STATE_KEY, state);
  }
}
