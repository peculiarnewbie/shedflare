const API_BASE = "https://api.cloudflare.com/client/v4";
const GRAPHQL_URL = `${API_BASE}/graphql`;

export class CfApiError extends Error {
  readonly status: number;
  readonly errors?: unknown[];

  constructor(message: string, status: number, errors?: unknown[]) {
    super(message);
    this.name = "CfApiError";
    this.status = status;
    this.errors = errors;
  }
}

interface CfResponse<T> {
  success: boolean;
  result: T;
  errors?: Array<{ message: string }>;
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function parseCfResponse<T>(res: Response): Promise<T> {
  const body = (await res.json()) as CfResponse<T> & { errors?: unknown[] };
  if (!res.ok || body.success === false) {
    const msg = body.errors?.[0]?.message ?? `Cloudflare API error: ${res.status}`;
    throw new CfApiError(msg, res.status, body.errors);
  }
  return body.result;
}

export async function cfGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders(token) });
  return parseCfResponse<T>(res);
}

export async function cfGraphql<T>(token: string, query: string): Promise<T> {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      ...authHeaders(token),
      "content-type": "application/json",
    },
    body: query,
  });
  if (!res.ok) throw new CfApiError(`GraphQL API error: ${res.status}`, res.status);
  const body = (await res.json()) as { data: T; errors?: unknown };
  if (body.errors) throw new CfApiError(`GraphQL errors: ${JSON.stringify(body.errors)}`, 400);
  return body.data;
}

export async function verifyCfToken(token: string, accountId: string): Promise<boolean> {
  try {
    await cfGet(token, `/accounts/${accountId}`);
    return true;
  } catch {
    return false;
  }
}
