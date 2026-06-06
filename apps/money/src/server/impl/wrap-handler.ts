import * as S from "effect/Schema";
export { wrapHttpHandler as wrapHandler } from "@shedflare/alchemy";

export function validatedJson(
  schema: Parameters<typeof S.encodeSync>[0],
  data: unknown,
  status = 200,
): Response {
  const encoded = (
    S.encodeSync as (s: Parameters<typeof S.encodeSync>[0]) => (u: unknown) => unknown
  )(schema)(data);
  return new Response(JSON.stringify(encoded), {
    status,
    headers: { "content-type": "application/json" },
  });
}
