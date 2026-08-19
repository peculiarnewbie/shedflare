import { createId, type JsonObject, type TraceSpanKind } from "#/domain";
import {
  createStructuredLogger,
  makeRootTraceContext,
  makeTraceRecorder,
  runAppEffect,
  traceEffect,
  type AppEnv,
} from "#/effect";
import { Effect } from "effect";

export async function runApiTrace<A>(input: {
  scope: string;
  name: string;
  kind: TraceSpanKind;
  env: AppEnv;
  attrs?: JsonObject;
  run: () => Promise<A>;
}) {
  const traceContext = makeRootTraceContext({});
  const rootSpanId = createId("span");
  const logger = createStructuredLogger(input.scope, {
    traceId: traceContext.traceId,
    traceRunId: traceContext.traceRunId,
    rootSpanId,
  });
  const recorder = makeTraceRecorder({
    scope: input.scope,
    logger,
  });

  // Cross-cutting concern: wrap the entire operation with span management
  const traceEffectWithSpan = Effect.tryPromise(input.run).pipe(
    Effect.andThen((result) => {
      return Effect.gen(function* () {
        yield* Effect.tryPromise(() =>
          recorder.startTraceRun({
            traceRunId: traceContext.traceRunId,
            traceId: traceContext.traceId,
            rootSpanId,
            messageId: null,
            threadId: null,
            workspaceId: null,
            modelId: null,
            attrs: input.attrs ?? {},
          }),
        );
        yield* Effect.tryPromise(() =>
          recorder.startSpan({
            spanId: rootSpanId,
            traceRunId: traceContext.traceRunId,
            traceId: traceContext.traceId,
            parentSpanId: null,
            messageId: null,
            name: `${input.scope}.request`,
            kind: "root",
            attrs: input.attrs ?? {},
          }),
        );
        return result;
      });
    }),
  );

  try {
    const result = await runAppEffect(
      traceEffect(input.name, input.kind, input.attrs ?? {}, traceEffectWithSpan),
      {
        env: input.env,
        traceRecorder: recorder,
        traceContext: {
          ...traceContext,
          parentSpanId: rootSpanId,
        },
      },
    );
    await recorder.finishSpan({
      spanId: rootSpanId,
      status: "completed",
    });
    await recorder.finishTraceRun({
      traceRunId: traceContext.traceRunId,
      status: "completed",
    });
    return result;
  } catch (error) {
    const errorCode = error instanceof Error ? error.name : "Error";
    const errorMessage = error instanceof Error ? error.message : String(error);
    await recorder.finishSpan({
      spanId: rootSpanId,
      status: "failed",
      errorCode,
      errorMessage,
    });
    await recorder.finishTraceRun({
      traceRunId: traceContext.traceRunId,
      status: "failed",
      errorCode,
      errorMessage,
    });
    throw error;
  }
}
