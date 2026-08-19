import * as Redacted from "effect/Redacted";
import {
  array,
  boolean,
  literal,
  object,
  optional,
  safeParse,
  string,
  unknown,
  type GenericSchema,
  type InferOutput,
} from "valibot";

/** Minimal credential shape from Alchemy's Cloudflare auth (avoids deep import paths). */
export type CfCredentials =
  | {
      type: "oauth";
      accessToken: Redacted.Redacted<string>;
      accountId: string;
    }
  | {
      type: "apiToken";
      apiToken: Redacted.Redacted<string>;
      accountId: string;
    }
  | {
      type: "apiKey";
      apiKey: Redacted.Redacted<string>;
      email: Redacted.Redacted<string>;
      accountId: string;
    };

const API_BASE = "https://api.cloudflare.com/client/v4";

export class CfApiError extends Error {
  readonly status: number;
  readonly errors?: ReadonlyArray<{ readonly message: string }>;

  constructor(
    message: string,
    status: number,
    errors?: ReadonlyArray<{ readonly message: string }>,
  ) {
    super(message);
    this.name = "CfApiError";
    this.status = status;
    this.errors = errors;
  }
}

export function cfAuthHeaders(credentials: CfCredentials) {
  switch (credentials.type) {
    case "oauth":
      return { Authorization: `Bearer ${Redacted.value(credentials.accessToken)}` };
    case "apiToken":
      return { Authorization: `Bearer ${Redacted.value(credentials.apiToken)}` };
    case "apiKey":
      return {
        "X-Auth-Email": Redacted.value(credentials.email),
        "X-Auth-Key": Redacted.value(credentials.apiKey),
      };
  }
}

const CfErrorSchema = object({ message: string() });

type WorkerSecretRequest =
  | { readonly name: string }
  | { readonly name: string; readonly text: string; readonly type: "secret_text" };

function cfResponseSchema<ResultSchema extends GenericSchema>(result: ResultSchema) {
  return object({
    success: literal(true),
    result,
    errors: optional(array(CfErrorSchema)),
  });
}

const CfFailureSchema = object({
  success: boolean(),
  errors: optional(array(CfErrorSchema)),
});

async function cfRequest<ResultSchema extends GenericSchema>(
  credentials: CfCredentials,
  method: string,
  path: string,
  resultSchema: ResultSchema,
  body?: WorkerSecretRequest,
): Promise<InferOutput<ResultSchema>> {
  const headers = new Headers(cfAuthHeaders(credentials));
  if (body !== undefined) headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const jsonBody: unknown = await response.json().catch(() => null);
  const success = safeParse(cfResponseSchema(resultSchema), jsonBody);
  if (response.ok && success.success) return success.output.result;

  const failure = safeParse(CfFailureSchema, jsonBody);
  if (failure.success) {
    throw new CfApiError(
      `Cloudflare API ${method} ${path} failed`,
      response.status,
      failure.output.errors,
    );
  }
  throw new CfApiError(`Cloudflare API ${method} ${path} returned invalid JSON`, response.status);
}

export async function listWorkerSecretNames(
  credentials: CfCredentials,
  accountId: string,
  workerName: string,
): Promise<string[]> {
  const secrets = await cfRequest(
    credentials,
    "GET",
    `/accounts/${accountId}/workers/scripts/${encodeURIComponent(workerName)}/secrets`,
    array(object({ name: string() })),
  );
  return secrets.map((s) => s.name).sort();
}

export async function putWorkerSecret(
  credentials: CfCredentials,
  accountId: string,
  workerName: string,
  binding: string,
  value: string,
): Promise<void> {
  await cfRequest(
    credentials,
    "PUT",
    `/accounts/${accountId}/workers/scripts/${encodeURIComponent(workerName)}/secrets`,
    unknown(),
    { name: binding, text: value, type: "secret_text" },
  );
}

export async function deleteWorkerSecret(
  credentials: CfCredentials,
  accountId: string,
  workerName: string,
  binding: string,
): Promise<void> {
  try {
    await cfRequest(
      credentials,
      "DELETE",
      `/accounts/${accountId}/workers/scripts/${encodeURIComponent(workerName)}/secrets`,
      unknown(),
      { name: binding },
    );
  } catch (error) {
    if (error instanceof CfApiError && error.status === 404) return;
    throw error;
  }
}
