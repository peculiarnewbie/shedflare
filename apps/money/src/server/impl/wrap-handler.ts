import * as S from "effect/Schema";
export { wrapHttpHandler as wrapHandler } from "@shedflare/alchemy";

export function validatedJson<
  SchemaType extends Parameters<typeof S.decodeUnknownSync>[0],
  Payload,
>(schema: SchemaType, data: Payload, status = 200): Response {
  const decoded = S.decodeUnknownSync(schema)(data);
  return new Response(JSON.stringify(decoded), {
    status,
    headers: { "content-type": "application/json" },
  });
}
