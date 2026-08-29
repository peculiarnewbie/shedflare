export type BuildInfo = {
  readonly version: string;
  readonly commit: string;
  readonly builtAt: string;
  readonly label: string;
  readonly tooltip: string;
};

function formatBuiltAt(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().replace(".000Z", "Z");
}

function commitLabel(value: string): string {
  return value.endsWith("-dirty") ? `${value.slice(0, 7)}-dirty` : value.slice(0, 7);
}

export function createBuildInfo(
  env: Readonly<Record<string, string | undefined>> | undefined,
): BuildInfo {
  const version = env?.VITE_APP_VERSION ?? "0.0.0-dev";
  const commit = env?.VITE_GIT_SHA ?? "dev";
  const builtAt = env?.VITE_BUILD_TIME ?? "";
  const formattedBuiltAt = formatBuiltAt(builtAt);

  return {
    version,
    commit,
    builtAt,
    label: formattedBuiltAt
      ? `built ${formattedBuiltAt} (${commitLabel(commit)})`
      : `built unknown (${commitLabel(commit)})`,
    tooltip: [
      formattedBuiltAt ? `built ${formattedBuiltAt}` : undefined,
      commit !== "dev" ? `commit ${commit}` : undefined,
      version,
    ]
      .filter((value): value is string => value !== undefined)
      .join("\n"),
  };
}
