function parseOrigin(value: unknown, clientId: string): string {
  if (typeof value !== "string") {
    throw new Error(`Additional origin for ${clientId} must be a string.`);
  }

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
  let additional: unknown;
  try {
    additional = JSON.parse(additionalJson);
  } catch {
    throw new Error("Auth ADDITIONAL_ALLOWED_CLIENTS must be valid JSON.");
  }

  if (!additional || typeof additional !== "object" || Array.isArray(additional)) {
    throw new Error("Auth ADDITIONAL_ALLOWED_CLIENTS must be a JSON object.");
  }

  const merged = Object.fromEntries(
    Object.entries(base).map(([clientId, origins]) => [clientId, [...origins]]),
  );

  for (const [clientId, origins] of Object.entries(additional)) {
    if (!(clientId in merged)) {
      throw new Error(`Additional origins reference unknown or disabled client ${clientId}.`);
    }
    if (!Array.isArray(origins)) {
      throw new Error(`Additional origins for ${clientId} must be an array.`);
    }

    for (const value of origins) {
      const origin = parseOrigin(value, clientId);
      if (!merged[clientId].includes(origin)) merged[clientId].push(origin);
    }
  }

  return merged;
}
