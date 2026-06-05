import * as S from "effect/Schema";
export { wrapHttpHandler as wrapHandler } from "@shedflare/alchemy";

export function validatedJson(schema: any, data: unknown, status = 200): Response {
  const encoded = S.encodeSync(schema)(data);
  return new Response(JSON.stringify(encoded), {
    status,
    headers: { "content-type": "application/json" },
  });
}
