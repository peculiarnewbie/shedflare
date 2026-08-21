import type { DiscordGatewayDurableObject } from "#/gateway/durable-object";

const GATEWAY_SINGLETON_NAME = "default";

export function getGatewayStub(namespace: DurableObjectNamespace<DiscordGatewayDurableObject>) {
  return namespace.get(namespace.idFromName(GATEWAY_SINGLETON_NAME));
}
