export type BuildInfo = {
  version: string;
  commit: string;
  builtAt: string;
  label: string;
  tooltip: string;
};

function formatBuiltAt(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().replace(".000Z", "Z");
}

function commitLabel(value: string) {
  return value.endsWith("-dirty") ? `${value.slice(0, 7)}-dirty` : value.slice(0, 7);
}

export function createBuildInfo(env: Record<string, string | undefined> | undefined): BuildInfo {
  const version = env?.VITE_APP_VERSION || "0.0.0-dev";
  const commit = env?.VITE_GIT_SHA || "dev";
  const builtAt = env?.VITE_BUILD_TIME || "";
  const formattedBuiltAt = formatBuiltAt(builtAt);

  return {
    version,
    commit,
    builtAt,
    label: formattedBuiltAt
      ? `built ${formattedBuiltAt} (${commitLabel(commit)})`
      : `built unknown (${commitLabel(commit)})`,
    tooltip: [
      formattedBuiltAt ? `built ${formattedBuiltAt}` : null,
      commit !== "dev" ? `commit ${commit}` : null,
      version,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}
