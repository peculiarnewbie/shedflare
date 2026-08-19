import { array, record, safeParse, string } from "valibot";

const AdditionalClientsSchema = record(string(), array(string()));

function parseOrigin(value: string, clientId: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Additional origin for ${clientId} is not a valid URL: ${value}`);
  }

  if (url.origin !== value || url.protocol !== "https:") {
    throw new Error(
      `Additional origin for ${clientId} must be a canonical HTTPS origin without a path: ${value}`,
    );
  }

  return url.origin;
}

export function mergeAdditionalAllowedClients(
  base: Readonly<Record<string, readonly string[]>>,
  additionalJson: string,
): Record<string, string[]> {
  let parsedJson;
  try {
    parsedJson = JSON.parse(additionalJson);
  } catch {
    throw new Error("Auth ADDITIONAL_ALLOWED_CLIENTS must be valid JSON.");
  }

  const additional = safeParse(AdditionalClientsSchema, parsedJson);
  if (!additional.success) {
    throw new Error("Auth ADDITIONAL_ALLOWED_CLIENTS must be a JSON object.");
  }

  const merged = Object.fromEntries(
    Object.entries(base).map(([clientId, origins]) => [clientId, [...origins]]),
  );

  for (const [clientId, origins] of Object.entries(additional.output)) {
    if (!/^shedflare-[a-z0-9][a-z0-9-]*$/.test(clientId)) {
      throw new Error(`Additional client ID must use the shedflare-<app> format: ${clientId}.`);
    }
    merged[clientId] ??= [];
    for (const value of origins) {
      const origin = parseOrigin(value, clientId);
      if (!merged[clientId].includes(origin)) merged[clientId].push(origin);
    }
  }

  return merged;
}
