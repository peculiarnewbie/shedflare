import {
  object,
  optional,
  parse,
  safeParse,
  string,
  type GenericSchema,
  type InferOutput,
} from "valibot";

const ErrorResponseSchema = object({ error: optional(string()) });

export async function apiGet<ResultSchema extends GenericSchema>(
  path: string,
  schema: ResultSchema,
): Promise<InferOutput<ResultSchema>> {
  const res = await fetch(path);
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = safeParse(ErrorResponseSchema, payload);
    throw new Error(
      error.success ? (error.output.error ?? `HTTP ${res.status}`) : `HTTP ${res.status}`,
    );
  }
  return parse(schema, payload);
}

export async function apiPatch<Data>(path: string, data: Data): Promise<void> {
  const res = await fetch(path, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = safeParse(ErrorResponseSchema, await res.json().catch(() => ({})));
    throw new Error(
      error.success ? (error.output.error ?? `HTTP ${res.status}`) : `HTTP ${res.status}`,
    );
  }
}
