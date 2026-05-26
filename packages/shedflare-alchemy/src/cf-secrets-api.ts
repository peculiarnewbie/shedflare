import * as Redacted from "effect/Redacted";

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
  constructor(
    message: string,
    readonly status: number,
    readonly errors?: unknown[],
  ) {
    super(message);
    this.name = "CfApiError";
  }
}

export function cfAuthHeaders(credentials: CfCredentials): Record<string, string> {
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

interface CfResponse<T> {
  success: boolean;
  result: T;
  errors?: Array<{ message: string }>;
}

async function cfRequest<T>(
  credentials: CfCredentials,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...cfAuthHeaders(credentials),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const json = (await response.json()) as CfResponse<T>;
  if (!response.ok || !json.success) {
    throw new CfApiError(`Cloudflare API ${method} ${path} failed`, response.status, json.errors);
  }
  return json.result;
}

export async function listWorkerSecretNames(
  credentials: CfCredentials,
  accountId: string,
  workerName: string,
): Promise<string[]> {
  const secrets = await cfRequest<Array<{ name: string }>>(
    credentials,
    "GET",
    `/accounts/${accountId}/workers/scripts/${encodeURIComponent(workerName)}/secrets`,
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
      { name: binding },
    );
  } catch (error) {
    if (error instanceof CfApiError && error.status === 404) return;
    throw error;
  }
}
