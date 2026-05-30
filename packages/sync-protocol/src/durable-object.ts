import { DataAccess } from "./data-access";
import { HandlerRegistry } from "./handler-registry";
import type {
  SyncClientEnvelope,
  SyncClientHello,
  SyncServerAck,
  SyncServerEnvelope,
  SyncServerEvent,
  SyncSnapshot,
} from "./sync-types";
import { json, nowIso, parseJson, isWebSocketRequest } from "./sync-utils";

export type HandlerContext<Env> = {
  access: DataAccess;
  env: Env;
};

export abstract class SyncEngineDO<Env> {
  protected ctx: DurableObjectState;
  protected env: Env;
  protected access: DataAccess;
  protected handlerRegistry: HandlerRegistry<HandlerContext<Env>>;

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
    this.access = new DataAccess(
      (query: string, ...params: unknown[]) => ctx.storage.sql.exec(query, ...params),
      <T extends Record<string, unknown>>(query: string, ...params: unknown[]): T | null => {
        const rows = ctx.storage.sql.exec(query, ...params).toArray() as T[];
        return rows[0] ?? null;
      },
      <T extends Record<string, unknown>>(query: string, ...params: unknown[]): T[] => {
        return ctx.storage.sql.exec(query, ...params).toArray() as T[];
      },
    );
    this.handlerRegistry = new HandlerRegistry<HandlerContext<Env>>();
  }

  // ─── Abstract ──────────────────────────────────────────────────

  abstract get protocolVersion(): string;
  abstract registerHandlers(registry: HandlerRegistry<HandlerContext<Env>>): void;
  abstract getSnapshot(): SyncSnapshot;
  protected abstract executeTransaction<T>(fn: () => T): T;

  // ─── Fetch — routing ───────────────────────────────────────────

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade at /ws
    if (url.pathname === "/ws") {
      if (!isWebSocketRequest(request)) {
        return new Response("Upgrade required", { status: 426 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    // Internal command endpoint
    if (url.pathname === "/internal/command" && request.method === "POST") {
      return this.handleInternalCommand(request);
    }

    // Snapshot endpoint
    if (url.pathname === "/internal/snapshot") {
      return Response.json(this.getSnapshot());
    }

    // REST routes — delegated to app via Effect HttpApp
    return this.handleApiRequest(request);
  }

  protected handleApiRequest(_request: Request): Promise<Response> | Response {
    return new Response("Not found", { status: 404 });
  }

  // ─── WebSocket ─────────────────────────────────────────────────

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const text = typeof message === "string" ? message : new TextDecoder().decode(message);
    let envelope: SyncClientEnvelope;
    try {
      envelope = parseJson<SyncClientEnvelope>(text);
    } catch {
      console.warn("[sync-protocol] Failed to parse WebSocket message envelope");
      return;
    }

    try {
      switch (envelope.type) {
        case "hello":
          await this.handleHello(ws, envelope);
          break;
        case "resume":
          await this.replayAfter(ws, envelope.lastServerSeq);
          break;
        case "ping":
          ws.send(json({ type: "pong", at: nowIso() } satisfies SyncServerEnvelope));
          break;
        case "command":
          await this.processCommand(envelope.opId, envelope.commandType, envelope.payload, true);
          break;
      }
    } catch (error) {
      ws.send(
        json({
          type: "sync_reset",
          reason: error instanceof Error ? error.message : "Unknown error",
          protocolVersion: this.protocolVersion,
          snapshot: this.getSnapshot(),
        } satisfies SyncServerEnvelope),
      );
    }
  }

  async webSocketClose(_ws: WebSocket): Promise<void> {
    // App can override
  }

  // ─── Alarm ──────────────────────────────────────────────────────

  async alarm(): Promise<void> {
    // App can override
  }

  // ─── Hello handshake ────────────────────────────────────────────

  protected async handleHello(ws: WebSocket, hello: SyncClientHello): Promise<void> {
    const lastServerSeq = this.access.getLastServerSeq();
    ws.send(
      json({
        type: "hello_ack",
        protocolVersion: this.protocolVersion,
        serverTime: nowIso(),
        lastServerSeq,
      } satisfies SyncServerEnvelope),
    );

    // Protocol mismatch → full reset
    if (hello.protocolVersion !== this.protocolVersion) {
      ws.send(
        json({
          type: "sync_reset",
          reason: "protocol_mismatch",
          protocolVersion: this.protocolVersion,
          snapshot: this.getSnapshot(),
        } satisfies SyncServerEnvelope),
      );
      return;
    }

    // Stale cursor or first sync → full snapshot
    const oldestSeq = this.access.getOldestEventSeq();
    const needsFullSync =
      hello.lastServerSeq <= 0 || (oldestSeq > 0 && hello.lastServerSeq < oldestSeq);

    if (needsFullSync) {
      const reason = hello.lastServerSeq <= 0 ? "initial_sync" : "cursor_stale";
      ws.send(
        json({
          type: "sync_reset",
          reason,
          protocolVersion: this.protocolVersion,
          snapshot: this.getSnapshot(),
        } satisfies SyncServerEnvelope),
      );
    } else {
      await this.replayAfter(ws, hello.lastServerSeq);
    }

    // Re-process unacked ops
    for (const opId of hello.unackedOpIds) {
      const ack = this.access.getCommandAck(opId);
      if (ack) ws.send(json(ack));
    }
  }

  // ─── Event replay ──────────────────────────────────────────────

  protected async replayAfter(ws: WebSocket, afterSeq: number): Promise<void> {
    const events = this.access.getEventsAfter(afterSeq);
    for (const event of events) {
      ws.send(json(event));
    }
  }

  // ─── Command processing ────────────────────────────────────────

  protected async processCommand(
    opId: string,
    commandType: string,
    payload: unknown,
    doBroadcast: boolean,
  ): Promise<{ ack: SyncServerAck | null; events: SyncServerEvent[] }> {
    const existing = this.access.getCommandAck(opId);
    if (existing) {
      return { ack: existing, events: [] };
    }

    const handler = this.handlerRegistry.get(commandType);
    if (!handler) {
      throw new Error(`Unknown command type: ${commandType}`);
    }

    const createdAt = nowIso();

    const result = this.executeTransaction(() => {
      const commandPayload =
        payload && typeof payload === "object"
          ? { ...(payload as Record<string, unknown>), commandType }
          : payload;

      const { events: resultEvents } = handler(opId, commandPayload, {
        access: this.access,
        env: this.env,
      });

      const ackedSeq =
        resultEvents.length > 0
          ? resultEvents[resultEvents.length - 1]!.serverSeq
          : this.access.getLastServerSeq();

      const ack = {
        type: "ack" as const,
        opId,
        serverSeq: ackedSeq,
        acceptedAt: createdAt,
        commandType,
      } satisfies SyncServerAck;

      const ackJson = json(ack);
      this.access.exec(
        `INSERT OR REPLACE INTO commands (op_id, type, status, response_json, acked_seq, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        opId,
        commandType,
        "accepted",
        ackJson,
        ackedSeq,
        createdAt,
      );

      return { ack, events: resultEvents };
    });

    if (doBroadcast) {
      this.broadcast(result.ack);
      for (const event of result.events) {
        this.broadcast(event);
      }
    }

    return { ack: result.ack, events: result.events };
  }

  // ─── Broadcast ──────────────────────────────────────────────────

  protected broadcast(envelope: SyncServerEnvelope): void {
    const message = json(envelope);
    const sockets = this.ctx.getWebSockets();
    for (const socket of sockets) {
      try {
        socket.send(message);
      } catch {
        console.warn("[sync-protocol] Failed to send broadcast message to socket");
      }
    }
  }

  // ─── Internal command ──────────────────────────────────────────

  private async handleInternalCommand(request: Request): Promise<Response> {
    const body = (await request.json().catch(() => {
      console.warn("[sync-protocol] handleInternalCommand request.json() failed");
      return null;
    })) as Record<string, unknown> | null;
    if (!body || typeof body.opId !== "string" || typeof body.commandType !== "string") {
      return new Response("Invalid command body", { status: 400 });
    }
    const result = await this.processCommand(
      body.opId as string,
      body.commandType as string,
      body.payload,
      true,
    );
    return Response.json({ ok: true, ack: result.ack });
  }
}
