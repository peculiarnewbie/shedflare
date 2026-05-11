/**
 * Lightweight tracing utility for money DO operations.
 *
 * Produces structured JSON logs in OTel span format. When the OTLP exporter
 * is wired up, replace this with `@opentelemetry/api` Tracer.startSpan() calls.
 *
 * TODO: Wire OTLP exporter via Cloudflare Workers OTLP endpoint
 * (See https://developers.cloudflare.com/workers/observability/opentelemetry/)
 */

const SERVICE_NAME = "shedflare-money-do";

let spanIdCounter = 0;
const activeSpans = new Map<string, { name: string; startTime: number; parentId?: string }>();

function generateId(): string {
  spanIdCounter++;
  return `span_${spanIdCounter}_${Date.now().toString(36)}`;
}

export function startSpan(name: string, attributes?: Record<string, unknown>): string {
  const spanId = generateId();
  const parentId = getActiveSpanId();
  activeSpans.set(spanId, { name, startTime: performance.now(), parentId });

  console.log(
    JSON.stringify({
      scope: SERVICE_NAME,
      event: "span_start",
      spanId,
      parentSpanId: parentId ?? null,
      name,
      attributes: attributes ?? {},
      timestamp: new Date().toISOString(),
    }),
  );

  return spanId;
}

export function endSpan(spanId: string, attributes?: Record<string, unknown>) {
  const span = activeSpans.get(spanId);
  if (!span) return;

  const duration = performance.now() - span.startTime;
  activeSpans.delete(spanId);

  console.log(
    JSON.stringify({
      scope: SERVICE_NAME,
      event: "span_end",
      spanId,
      parentSpanId: span.parentId ?? null,
      name: span.name,
      durationMs: Math.round(duration * 100) / 100,
      attributes: attributes ?? {},
      timestamp: new Date().toISOString(),
    }),
  );
}

export function trace<T>(name: string, fn: () => T, attributes?: Record<string, unknown>): T {
  const spanId = startSpan(name, attributes);
  try {
    return fn();
  } finally {
    endSpan(spanId);
  }
}

export async function traceAsync<T>(
  name: string,
  fn: () => Promise<T>,
  attributes?: Record<string, unknown>,
): Promise<T> {
  const spanId = startSpan(name, attributes);
  try {
    return await fn();
  } finally {
    endSpan(spanId);
  }
}

// Stack-based parent span tracking (per-call-chain, not per-async-context)
const spanStack: string[] = [];

export function startSpanWithStack(name: string, attributes?: Record<string, unknown>): string {
  const parentId = spanStack.at(-1);
  const spanId = generateId();
  spanStack.push(spanId);
  activeSpans.set(spanId, { name, startTime: performance.now(), parentId });

  console.log(
    JSON.stringify({
      scope: SERVICE_NAME,
      event: "span_start",
      spanId,
      parentSpanId: parentId ?? null,
      name,
      attributes: attributes ?? {},
      timestamp: new Date().toISOString(),
    }),
  );

  return spanId;
}

export function endSpanWithStack(spanId: string, attributes?: Record<string, unknown>) {
  const span = activeSpans.get(spanId);
  if (!span) return;
  spanStack.pop();

  const duration = performance.now() - span.startTime;
  activeSpans.delete(spanId);

  console.log(
    JSON.stringify({
      scope: SERVICE_NAME,
      event: "span_end",
      spanId,
      parentSpanId: span.parentId ?? null,
      name: span.name,
      durationMs: Math.round(duration * 100) / 100,
      attributes: attributes ?? {},
      timestamp: new Date().toISOString(),
    }),
  );
}

export function traceWithStack<T>(
  name: string,
  fn: () => T,
  attributes?: Record<string, unknown>,
): T {
  const spanId = startSpanWithStack(name, attributes);
  try {
    return fn();
  } finally {
    endSpanWithStack(spanId);
  }
}

function getActiveSpanId(): string | undefined {
  return spanStack.at(-1);
}
