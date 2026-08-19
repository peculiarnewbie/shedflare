import {
  array,
  boolean,
  object,
  optional,
  parse,
  string,
  type GenericSchema,
  type InferOutput,
} from "valibot";

const API_BASE = "https://api.cloudflare.com/client/v4";
const GRAPHQL_URL = `${API_BASE}/graphql`;
const CfErrorSchema = object({ message: string() });

export interface CfApiErrorDetail {
  message: string;
}

export class CfApiError extends Error {
  readonly status: number;
  readonly errors?: readonly CfApiErrorDetail[];

  constructor(message: string, status: number, errors?: readonly CfApiErrorDetail[]) {
    super(message);
    this.name = "CfApiError";
    this.status = status;
    this.errors = errors;
  }
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function parseCfResponse<ResultSchema extends GenericSchema>(
  res: Response,
  resultSchema: ResultSchema,
): Promise<InferOutput<ResultSchema>> {
  const body = parse(
    object({
      success: boolean(),
      result: resultSchema,
      errors: optional(array(CfErrorSchema)),
    }),
    await res.json(),
  );
  if (!res.ok || !body.success) {
    const message = body.errors?.[0]?.message ?? `Cloudflare API error: ${res.status}`;
    throw new CfApiError(message, res.status, body.errors);
  }
  return body.result;
}

export async function cfGet<ResultSchema extends GenericSchema>(
  token: string,
  path: string,
  resultSchema: ResultSchema,
): Promise<InferOutput<ResultSchema>> {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders(token) });
  return parseCfResponse(res, resultSchema);
}

export async function cfGraphql<ResultSchema extends GenericSchema>(
  token: string,
  query: string,
  resultSchema: ResultSchema,
): Promise<InferOutput<ResultSchema>> {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      ...authHeaders(token),
      "content-type": "application/json",
    },
    body: query,
  });
  if (!res.ok) throw new CfApiError(`GraphQL API error: ${res.status}`, res.status);
  const body = parse(
    object({ data: resultSchema, errors: optional(array(CfErrorSchema)) }),
    await res.json(),
  );
  if (body.errors) {
    throw new CfApiError(`GraphQL errors: ${JSON.stringify(body.errors)}`, 400, body.errors);
  }
  return body.data;
}

export async function verifyCfToken(token: string, accountId: string): Promise<boolean> {
  try {
    await cfGet(token, `/accounts/${accountId}`, object({}));
    return true;
  } catch {
    return false;
  }
}
