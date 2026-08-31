type CatalogModel = { id: string };

const AUTO_MODEL_PRIORITY = [
  "kimi-k3",
  "qwen3.6-plus",
  "gpt-5.6-luna",
  "deepseek-v4-flash",
] as const;

/** Resolve `auto` by an explicit product policy, never by catalog sort order. */
export function selectAutomaticModelId(models: readonly CatalogModel[]): string | null {
  for (const preferredId of AUTO_MODEL_PRIORITY) {
    const model = models.find(
      ({ id }) => id === preferredId || id.split("/").at(-1) === preferredId,
    );
    if (model) return model.id;
  }
  return models[0]?.id ?? null;
}
