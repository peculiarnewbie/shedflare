export function physicalName(stage: string | undefined, ...parts: string[]): string {
  const safeStage = (stage || "prod").toLowerCase().replaceAll(/[^a-z0-9-]/g, "-");
  return ["shedflare", safeStage, ...parts].join("-").replaceAll(/-+/g, "-");
}
