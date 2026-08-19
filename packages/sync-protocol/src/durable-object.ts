import { Cause, Effect } from "effect";
import * as Schema from "effect/Schema";
import { DataAccess } from "./data-access";
import { SyncDecodeError, SyncStorageError, UnknownSyncCommandError } from "./errors";
import { HandlerRegistry } from "./handler-registry";
import type {
  SyncClientHello,
  SyncClientCommand,
  SyncServerAck,
  SyncServerEnvelope,
  SyncServerEvent,
  SyncSnapshot,
} from "./sync-types";
import { decodeSyncClientEnvelope, isWebSocketRequest, json, nowIso } from "./sync-utils";

export type HandlerContext<Env> = {
  access: DataAccess;
  env: Env;
};

type CommandResult = {
  ack: SyncServerAck | null;
  events: SyncServerEvent[];
};

const CommandPayloadRecordSchema = Schema.Record(Schema.String, Schema.Unknown);

const InternalCommandSchema = Schema.Struct({
  opId: Schema.String,
  commandType: Schema.String,
  payload: Schema.optional(Schema.Unknown),
});

export abstract class SyncEngineDO<Env> {
  protected ctx: DurableObjectState;
  protected env: Env;
  protected access: DataAccess;
  protected handlerRegistry: HandlerRegistry<HandlerContext<Env>>;

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
    this.access = new DataAccess((query, ...params) => ctx.storage.sql.exec(query, ...params));
    this.handlerRegistry = new HandlerRegistry<HandlerContext<Env>>();
  }

  abstract get protocolVersion(): string;
  abstract registerHandlers(registry: HandlerRegistry<HandlerContext<Env>>): void;
  protected abstract getSnapshotEffect(): Effect.Effect<SyncSnapshot, unknown, never>;
  protected abstract executeTransaction<A, E>(
    effect: Effect.Effect<A, E, never>,
  ): Effect.Effect<A, E | SyncStorageError, never>;

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      if (!isWebSocketRequest(request)) {
        return new Response("Upgrade required", { status: 426 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === "/internal/command" && request.method === "POST") {
      return Effect.runPromise(this.handleInternalCommand(request));
    }

    if (url.pathname === "/internal/snapshot") {
      return Effect.runPromise(
        this.getSnapshotEffect().pipe(Effect.map((snapshot) => Response.json(snapshot))),
      );
    }

    return this.handleApiRequest(request);
  }

  protected handleApiRequest(_request: Request): Promise<Response> | Response {
    return new Response("Not found", { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const program = Effect.gen({ self: this }, function* (this: SyncEngineDO<Env>) {
      const text = message instanceof ArrayBuffer ? new TextDecoder().decode(message) : message;
      const envelope = yield* decodeSyncClientEnvelope(text);

      switch (envelope.type) {
        case "hello":
          yield* this.handleHello(envelope, ws);
          break;
        case "resume":
          yield* this.replayAfter(ws, envelope.lastServerSeq);
          break;
        case "command":
          yield* this.processCommandEffect(
            envelope.opId,
            envelope.commandType,
            envelope.payload,
            true,
          );
          break;
      }
    }).pipe(
      Effect.catchCause((cause) =>
        this.getSnapshotEffect().pipe(
          Effect.flatMap((snapshot) =>
            Effect.sync(() =>
              ws.send(
                json({
                  type: "sync_reset",
                  reason: Cause.pretty(cause),
                  protocolVersion: this.protocolVersion,
                  snapshot,
                } satisfies SyncServerEnvelope),
              ),
            ),
          ),
          Effect.catchCause((snapshotCause) =>
            Effect.sync(() =>
              console.error(
                "[sync-protocol] Failed to report protocol failure",
                Cause.pretty(snapshotCause),
              ),
            ),
          ),
        ),
      ),
    );

    await Effect.runPromise(program);
  }

  async webSocketClose(_ws: WebSocket): Promise<void> {}

  async alarm(): Promise<void> {}

  protected handleHello(hello: SyncClientHello, ws: WebSocket) {
    return Effect.gen({ self: this }, function* (this: SyncEngineDO<Env>) {
      const lastServerSeq = yield* this.access.getLastServerSeq();
      yield* Effect.sync(() =>
        ws.send(
          json({
            type: "hello_ack",
            protocolVersion: this.protocolVersion,
            serverTime: nowIso(),
            lastServerSeq,
          } satisfies SyncServerEnvelope),
        ),
      );

      if (hello.protocolVersion !== this.protocolVersion) {
        const snapshot = yield* this.getSnapshotEffect();
        yield* Effect.sync(() =>
          ws.send(
            json({
              type: "sync_reset",
              reason: "protocol_mismatch",
              protocolVersion: this.protocolVersion,
              snapshot,
            } satisfies SyncServerEnvelope),
          ),
        );
        return;
      }

      const oldestSeq = yield* this.access.getOldestEventSeq();
      const needsFullSync =
        hello.lastServerSeq <= 0 || (oldestSeq > 0 && hello.lastServerSeq < oldestSeq);

      if (needsFullSync) {
        const snapshot = yield* this.getSnapshotEffect();
        yield* Effect.sync(() =>
          ws.send(
            json({
              type: "sync_reset",
              reason: hello.lastServerSeq <= 0 ? "initial_sync" : "cursor_stale",
              protocolVersion: this.protocolVersion,
              snapshot,
            } satisfies SyncServerEnvelope),
          ),
        );
      } else {
        yield* this.replayAfter(ws, hello.lastServerSeq);
      }

      yield* Effect.forEach(
        hello.unackedOpIds,
        (opId) =>
          this.access
            .getCommandAck(opId)
            .pipe(
              Effect.flatMap((ack) => (ack ? Effect.sync(() => ws.send(json(ack))) : Effect.void)),
            ),
        { discard: true },
      );
    });
  }

  protected replayAfter(ws: WebSocket, afterSeq: number) {
    return this.access.getEventsAfter(afterSeq).pipe(
      Effect.flatMap((events) =>
        Effect.forEach(events, (event) => Effect.sync(() => ws.send(json(event))), {
          discard: true,
        }),
      ),
    );
  }

  protected processCommandEffect(
    opId: string,
    commandType: string,
    payload: SyncClientCommand["payload"],
    doBroadcast: boolean,
  ) {
    return Effect.gen({ self: this }, function* (this: SyncEngineDO<Env>) {
      const existing = yield* this.access.getCommandAck(opId);
      if (existing) return { ack: existing, events: [] } satisfies CommandResult;

      const handler = this.handlerRegistry.get(commandType);
      if (!handler) return yield* new UnknownSyncCommandError({ commandType });
      const createdAt = nowIso();

      const result = yield* this.executeTransaction(
        Effect.gen({ self: this }, function* (this: SyncEngineDO<Env>) {
          const commandPayload = Schema.is(CommandPayloadRecordSchema)(payload)
            ? { ...payload, commandType }
            : payload;
          const handled = yield* handler(opId, commandPayload, {
            access: this.access,
            env: this.env,
          });
          const ackedSeq =
            handled.events.at(-1)?.serverSeq ?? (yield* this.access.getLastServerSeq());
          const ack = {
            type: "ack" as const,
            opId,
            serverSeq: ackedSeq,
            acceptedAt: createdAt,
            commandType,
          } satisfies SyncServerAck;

          yield* this.access.exec(
            `INSERT OR REPLACE INTO commands (op_id, type, status, response_json, acked_seq, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            opId,
            commandType,
            "accepted",
            json(ack),
            ackedSeq,
            createdAt,
          );
          return { ack, events: handled.events, followUp: handled.followUp };
        }),
      );

      if (doBroadcast) {
        yield* Effect.sync(() => {
          this.broadcast(result.ack);
          for (const event of result.events) this.broadcast(event);
        });
      }
      if (result.followUp) {
        const followUp = result.followUp;
        yield* Effect.sync(() =>
          this.ctx.waitUntil(
            Effect.runPromise(
              followUp.pipe(
                Effect.catchCause((cause) =>
                  Effect.sync(() =>
                    console.error("[sync-protocol] Command follow-up failed", Cause.pretty(cause)),
                  ),
                ),
              ),
            ),
          ),
        );
      }
      return { ack: result.ack, events: result.events } satisfies CommandResult;
    });
  }

  protected broadcast(envelope: SyncServerEnvelope): void {
    const message = json(envelope);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(message);
      } catch {
        console.warn("[sync-protocol] Failed to send broadcast message to socket");
      }
    }
  }

  private handleInternalCommand(request: Request) {
    return Effect.tryPromise({
      try: () => request.json(),
      catch: (cause) => new SyncDecodeError({ target: "internalCommand", cause }),
    }).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(InternalCommandSchema)),
      Effect.matchEffect({
        onFailure: () => Effect.succeed(new Response("Invalid command body", { status: 400 })),
        onSuccess: (body) =>
          this.processCommandEffect(body.opId, body.commandType, body.payload, true).pipe(
            Effect.map((result) => Response.json({ ok: true, ack: result.ack })),
          ),
      }),
    );
  }
}
