# Effect Patterns Used in the Chat App

This codebase uses [Effect-TS](https://effect.website/) in a **limited, pragmatic way** — not the full algebraic-effect ecosystem. We use Effect for three specific things:

1. **Schema validation** (`effect/Schema`) — runtime type checking for WebSocket command/event payloads
2. **Dependency injection** (`effect/Context`, `effect/Layer`) — wiring services into the tracing system
3. **Tracing spans** (`Effect.gen`, `Effect.tryPromise`, `Effect.provideService`) — wrapping async operations with OpenTelemetry-style spans

We do NOT use Effect for:

- Control flow (no `Effect.flatMap` chains replacing async/await)
- Error handling (we throw `Error` subclasses, not `Effect.fail`)
- Concurrency (no `Effect.fork`/`Effect.join`)
- Resource management (no `Scope`/`acquireUseRelease`)

This keeps the learning curve manageable while still getting value from Effect's schema and DI patterns.

---

## 1. Effect Schema for Runtime Validation

### What We Do

Every WebSocket command payload and event payload is defined as an Effect Schema and validated at the boundary.

```typescript
// src/domain/index.ts

import * as Schema from "effect/Schema";

// Define a schema
export const MessageRow = Schema.Struct({
  id: Schema.String,
  threadId: Schema.String,
  parentMessageId: Schema.NullOr(Schema.String),
  role: Schema.Literals(["user", "assistant", "system"]),
  status: Schema.Literals(["queued", "pending", "streaming", "completed", "failed", "cancelled"]),
  text: Schema.String,
  // ... more fields
});

// Derive the TypeScript type from the schema (single source of truth)
// type MessageRow = Schema.Schema.Type<typeof MessageRow>

// Decode at runtime — throws if invalid
const decoded = Schema.decodeUnknownSync(MessageRow)(incomingData);

// For command payloads, we use a registry pattern:
export const CommandPayloadSchemas = {
  create_user_message: CreateUserMessagePayloadSchema,
  retry_message: RetryMessagePayloadSchema,
  edit_user_message: EditUserMessagePayloadSchema,
  // ... 17 more
} as const;

export function decodeCommand<K extends SyncCommandType>(
  commandType: K,
  input: unknown,
): SyncCommandPayloadMap[K] {
  const schema = CommandPayloadSchemas[commandType];
  return Schema.decodeUnknownSync(schema)(input);
}
```

### Why Effect Schema Instead of...

#### ...Zod?

```typescript
// Zod version (equally valid, just different ecosystem)
import { z } from "zod";

const MessageRow = z.object({
  id: z.string(),
  threadId: z.string(),
  parentMessageId: z.string().nullable(),
  role: z.enum(["user", "assistant", "system"]),
  text: z.string(),
});
```

Effect Schema and Zod are roughly equivalent for validation. We use Effect Schema because:

- We already import Effect for tracing, so there is no extra dependency
- Effect Schema integrates with Effect's error channel (`ParseError` is an `Effect.Effect`)

If we were _only_ doing validation, Zod would be the simpler choice.

#### ...plain TypeScript types with manual validation?

```typescript
// Plain TS — no runtime check
interface MessageRow {
  id: string;
  threadId: string;
  parentMessageId: string | null;
  role: "user" | "assistant" | "system";
  text: string;
}

// But this doesn't validate at runtime:
function handleCommand(payload: any) {
  const msg: MessageRow = payload; // No safety — could be anything
}
```

This is the **anti-pattern**. WebSocket payloads arrive as untyped JSON. Without runtime validation, a malformed payload would produce cryptic errors deep in the code. Effect Schema (or Zod, or io-ts) validates at the boundary so downstream code can trust its types.

### The `Schema.Schema.Type` Trick

```typescript
// Define schema once
export const MessageRow = Schema.Struct({ ... });

// Derive both the runtime validator and the TS type
export type MessageRow = Schema.Schema.Type<typeof MessageRow>;
//                                          ^^^^^^^^^^^^^^^^^^^^^^^^
// This reads: "give me the TS type that this schema describes"

// Usage — single import, two purposes:
import { MessageRow } from "#/domain";

// Runtime validation
Schema.decodeUnknownSync(MessageRow)(data);

// TypeScript type
function formatMessage(msg: MessageRow) { ... }
```

**Anti-pattern** — defining types separately from schemas:

```typescript
// DON'T do this — they will drift
interface MessageRow {
  id: string;
  // ...
}

const MessageRowSchema = Schema.Struct({
  id: Schema.String,
  // ...
});
```

### Factory Functions with Decode

We use a pattern where factory functions create valid entities by constructing a plain object and running it through `decode*`:

```typescript
export function createMessage(input: {
  threadId: string;
  role: MessageRole;
  modelId: string;
  text?: string;
  status?: MessageStatus;
}) {
  const now = nowIso();
  return decodeMessageRow({
    id: createId("msg"),
    threadId: input.threadId,
    parentMessageId: null,
    role: input.role,
    status: input.status ?? "completed",
    modelId: input.modelId,
    text: input.text ?? "",
    createdAt: now,
    updatedAt: now,
    // ... defaults for all remaining fields
  });
}
```

This ensures the factory always produces a valid row, even if you forget a field — the schema fills in defaults and validates.

---

## 2. Dependency Injection with Context Tags and Layers

### What We Do

We define service tags (typed identifiers) and wire them into a Layer at runtime. This is used exclusively for the tracing system.

```typescript
// src/effect/index.ts

import { Context, Layer, Effect } from "effect";

// 1. Define the service interface
export interface TraceRecorderService {
  startTraceRun(input: { traceRunId: string; traceId: string; ... }): Promise<void>;
  finishTraceRun(input: { traceRunId: string; status: TraceStatus; ... }): Promise<void>;
  startSpan(input: { spanId: string; ... }): Promise<void>;
  finishSpan(input: { spanId: string; status: TraceStatus; ... }): Promise<void>;
}

// 2. Create a Context Tag (a typed key)
export const TraceRecorder = Context.Service<TraceRecorderService>("#/effect/TraceRecorder");

// 3. Define the app's runtime input type
type AppRuntimeInput = {
  env: AppEnv;
  traceRecorder: TraceRecorderService;
  traceContext: TraceContextValue;
};

// 4. Assemble a Layer (a container of services)
export const AppRuntime = {
  layer(input: AppRuntimeInput) {
    return Layer.mergeAll(
      Layer.succeed(AppEnvTag, input.env),
      Layer.succeed(TraceRecorder, input.traceRecorder),
      Layer.succeed(TraceContext, input.traceContext),
    );
  },
};

// 5. Run an effect with services provided
export function runAppEffect<A, E, R>(effect: Effect.Effect<A, E, R>, input: AppRuntimeInput) {
  return Effect.runPromise(
    effect.pipe(Effect.provide(AppRuntime.layer(input))) as Effect.Effect<A, E, never>,
  );
}
```

Then in the effect itself, you access services with `yield*`:

```typescript
function* () {
  const recorder = yield* TraceRecorder;  // Effect.Effect<TraceRecorderService>
  const context = yield* TraceContext;    // Effect.Effect<TraceContextValue>
  // use recorder and context...
}
```

### Plain TypeScript Equivalent

```typescript
// What this replaces — just passing objects through function arguments:

async function doSomething(
  recorder: TraceRecorderService,
  context: TraceContextValue,
  env: AppEnv,
) {
  await recorder.startSpan({ ...context, name: "something" });
  // ...
}
```

The Effect DI pattern becomes worth it when you have deeply nested calls. Instead of threading `env`, `recorder`, and `context` through 5 levels of function calls, any function in the `Effect` context can call `yield* TraceRecorder` to access it.

### Anti-Pattern: Threading Everything Manually

```typescript
// DON'T — this creates coupling and noise:

async function runAssistantTurn(
  payload: AssistantTurnPayload,
  access: DataAccess,
  eventStore: EventStore,
  env: AppEnv,
  broadcast: (e: SyncServerEnvelope) => void,
  assistantTurnControllers: Map<string, AbortController>,
) {
  await doStep1(access, eventStore, env, broadcast);
}

async function doStep1(
  access: DataAccess,
  eventStore: EventStore,
  env: AppEnv,
  broadcast: (e: SyncServerEnvelope) => void,
) {
  await doStep2(access, eventStore);
}
```

This is exactly what we do in the server-side code (command-handlers.ts, assistant-turn.ts) — we pass a context object explicitly. We only use Effect DI for tracing because span nesting needs the parentSpanId to be threaded automatically via `Effect.provideService`.

### When We Use It vs. When We Don't

We use Effect DI **only** inside `traceEffect`:

```typescript
export function traceEffect<A, E, R>(
  name: string,
  kind: TraceSpanKind,
  attrs: Record<string, unknown>,
  effect: Effect.Effect<A, E, R>,
) {
  return Effect.gen(function* () {
    const recorder = yield* TraceRecorder;   // <-- DI here
    const context = yield* TraceContext;      // <-- DI here
    const spanId = createId("span");
    yield* Effect.tryPromise(() => recorder.startSpan({ ... }));
    const childContext = { ...context, parentSpanId: spanId };
    return yield* effect.pipe(
      Effect.provideService(TraceContext, childContext),  // <-- override context for children
      Effect.onExit((exit) => { ... recorder.finishSpan(...) }),
    );
  });
}
```

This is elegant because span nesting is automatic — each `traceEffect` call pushes a new `parentSpanId` into the context, and child effects inherit it.

---

## 3. `Effect.gen` and the Generator Syntax

### What We Do

We use `Effect.gen` (the generator-based syntax) to write Effect code that looks like async/await:

```typescript
// effect/index.ts
export function traceEffect(...) {
  return Effect.gen(function* () {
    const recorder = yield* TraceRecorder;       // like `await`
    const context = yield* TraceContext;
    const spanId = createId("span");
    yield* Effect.tryPromise(() => recorder.startSpan({ ... }));
    //  ^^^^ this also "awaits" inside Effect
    const childContext = { ...context, parentSpanId: spanId };
    return yield* effect.pipe(
      Effect.provideService(TraceContext, childContext),
      Effect.onExit((exit) => { ... }),
    );
  });
}
```

### How Generator Syntax Maps to Async/Await

| Effect                                | JavaScript analogy                |
| ------------------------------------- | --------------------------------- |
| `yield* someEffect`                   | `await somePromise`               |
| `Effect.gen(function* () { ... })`    | `async function() { ... }`        |
| `return yield* effect`                | `return await promise`            |
| `Effect.tryPromise(() => fetch(...))` | Wrapping a Promise into an Effect |

### The `.pipe()` Alternative

The same code could be written with `.pipe()` instead of generators:

```typescript
// pipe-style (more functional, less readable for most people)
export function traceEffect(name, kind, attrs, effect) {
  return Effect.andThen(
    Effect.all([TraceRecorder, TraceContext]),
    ([recorder, context]) => {
      const spanId = createId("span");
      return Effect.tryPromise(() => recorder.startSpan({ ... }))
        .pipe(
          Effect.andThen(() => {
            const childContext = { ...context, parentSpanId: spanId };
            return effect.pipe(
              Effect.provideService(TraceContext, childContext),
              Effect.onExit((exit) => { ... }),
            );
          }),
        );
    },
  );
}
```

The generator version reads more naturally for people familiar with async/await. We use generators consistently.

### Anti-Pattern: Mixing Generators with `.pipe()` Unnecessarily

```typescript
// DON'T — this is confusing:
return Effect.gen(function* () {
  const x = yield* effectA;
  return yield* effectB.pipe(Effect.map((y) => x + y));
});
```

If you're already in a generator, just use another `yield*`:

```typescript
// DO — consistent:
return Effect.gen(function* () {
  const x = yield* effectA;
  const y = yield* effectB;
  return x + y;
});
```

---

## 4. `Effect.tryPromise` — Wrapping Promises

### What We Do

When we need to call an async function (a Promise-returning function) inside an Effect, we wrap it with `Effect.tryPromise`:

```typescript
yield *
  Effect.tryPromise(() =>
    recorder.startSpan({
      spanId,
      traceRunId: context.traceRunId,
      traceId: context.traceId,
      // ...
    }),
  );
```

### Plain TypeScript Equivalent

```typescript
// Without Effect, this is just:
await recorder.startSpan({ spanId, ... });
```

`Effect.tryPromise` converts a `Promise<A>` into an `Effect<A, unknown, never>`. If the promise rejects, the error becomes the Effect's error channel.

### With Error Handling

```typescript
// Catch errors from the promise:
yield *
  Effect.tryPromise(() => riskyOperation()).pipe(
    Effect.catchAll((error) =>
      Effect.sync(() => {
        console.error("Operation failed:", error);
        return fallbackValue;
      }),
    ),
  );
```

---

## 5. Tagged Error Classes

### What We Do

We define error classes with a `_tag` discriminator property:

```typescript
// src/effect/index.ts
export class CancelledError extends Error {
  readonly _tag = "CancelledError";
  constructor(message = "Cancelled") {
    super(message);
    this.name = this._tag;
  }
}

export class ProviderTimeoutError extends Error {
  readonly _tag = "ProviderTimeoutError";
  constructor(message: string) {
    super(message);
    this.name = this._tag;
  }
}

export type AppError =
  | CancelledError
  | ProviderTimeoutError
  | InvalidRequestError
  | AuthError
  | RateLimitError
  | SearchFailureError
  | SyncFailureError
  | UnknownUpstreamError;
```

### Why Tagged Errors?

The `_tag` property enables discriminated union narrowing:

```typescript
function handleError(error: AppError) {
  switch (error._tag) {
    case "CancelledError":
      // TypeScript knows this is CancelledError
      return "Operation was cancelled";
    case "ProviderTimeoutError":
      return "The AI provider timed out";
    // ...
  }
}
```

### Anti-Pattern: Using `instanceof` for Error Types

```typescript
// Works but fragile — instanceof breaks across module boundaries
// (e.g., different copies of the class in different bundles)
if (error instanceof CancelledError) { ... }

// Better — use the _tag:
if (error._tag === "CancelledError") { ... }
```

We serialize errors by `_tag` for the same reason:

```typescript
function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      errorCode: (error as { _tag?: string })._tag ?? error.name ?? "Error",
      errorMessage: error.message,
    };
  }
  return { errorCode: "UnknownUpstreamError", errorMessage: String(error) };
}
```

---

## 6. The `traceAsync` / `traceSync` Adapter Pattern

### What We Do

In `assistant-turn.ts`, we create wrapper functions that bridge Effect and async/await:

```typescript
// assistant-turn.ts

const traceRuntime = {
  env: ctx.env,
  traceRecorder: recorder,
  traceContext: childTraceContext,
};

const traceAsync = <A>(
  name: string,
  kind: TraceSpan["kind"],
  attrs: Record<string, unknown>,
  run: () => Promise<A>,
) => runAppEffect(traceEffect(name, kind, attrs, Effect.tryPromise(run)), traceRuntime);

const traceSync = <A>(
  name: string,
  kind: TraceSpan["kind"],
  attrs: Record<string, unknown>,
  run: () => A,
) => runAppEffect(traceEffect(name, kind, attrs, Effect.sync(run)), traceRuntime);
```

### Usage

```typescript
// Wrap any async operation with tracing:
const threadMessages = await traceSync("assistant.thread_messages.load", "sync", {}, () =>
  ctx.access.getThreadMessages(thread, [payload.userMessage, payload.assistantMessage]),
);

// Wrap any promise-returning operation:
const { messages, systemPrompts } = await traceAsync(
  "assistant.attachments.resolve",
  "io",
  { threadMessageCount: threadMessages.length },
  () => buildModelMessages(workspace.id, threadMessages, ctx.access, ctx.env),
);
```

### Why This Pattern Exists

The `runAppEffect` function provides the runtime layer (env, recorder, context), runs the effect, and returns a plain Promise. This means we can use Effect for tracing spans while keeping the rest of the code in regular async/await.

### Plain TypeScript Equivalent

```typescript
// Without Effect, we'd manually track spans:
const startTime = Date.now();
try {
  const result = await buildModelMessages(workspace.id, threadMessages, ctx.access, ctx.env);
  await recorder.finishSpan({ spanId, status: "completed", durationMs: Date.now() - startTime });
  return result;
} catch (error) {
  await recorder.finishSpan({ spanId, status: "failed", errorMessage: String(error) });
  throw error;
}
```

The Effect version is more concise and eliminates the error-handling boilerplate via `Effect.onExit`.

---

## 7. Schema.Literals for Enums

### What We Do

```typescript
export const ReasoningLevel = Schema.Literals(["off", "low", "medium", "high"]);
export const MessageStatus = Schema.Literals([
  "queued",
  "pending",
  "streaming",
  "completed",
  "failed",
  "cancelled",
]);
export const MessageRole = Schema.Literals(["user", "assistant", "system"]);
export const MessagePartKind = Schema.Literals([
  "activity",
  "thinking_tokens",
  "text",
  "reasoning",
]);
```

### Plain TypeScript Equivalent

```typescript
type ReasoningLevel = "off" | "low" | "medium" | "high";
```

Effect Schema `Literals` gives us runtime validation of these string unions. A payload with `role: "admin"` will be caught at the WebSocket boundary instead of producing a confusing error later.

### Deriving the TS Type

```typescript
export type ReasoningLevel = Schema.Schema.Type<typeof ReasoningLevel>;
// This resolves to: "off" | "low" | "medium" | "high"
```

---

## Summary: Effect Usage Map

| File                           | Effect feature                                                                                                                    | What it does                              |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `src/domain/index.ts`          | `Schema.Struct`, `Schema.Literals`, `Schema.decodeUnknownSync`                                                                    | Validate WebSocket command/event payloads |
| `src/effect/index.ts`          | `Context.Service`, `Layer.succeed`, `Effect.gen`, `Effect.tryPromise`, `Effect.provide`, `Effect.provideService`, `Effect.onExit` | DI for tracing, error types               |
| `src/server/assistant-turn.ts` | `runAppEffect`, `traceEffect`                                                                                                     | Wrap operations with tracing spans        |
| `src/server/search.ts`         | `traceEffect` (via callback)                                                                                                      | Trace search tool calls                   |
| `src/server/extract.ts`        | `traceEffect` (via callback)                                                                                                      | Trace browser extract calls               |
| `alchemy.run.ts`               | `Effect.gen`                                                                                                                      | Alchemy deployment stack                  |
| `alchemy.test.ts`              | `Effect.gen`, `Effect.promise`                                                                                                    | Live smoke tests                          |
