import spawn from "nano-spawn";

export interface WranglerUser {
  email: string;
}

async function wrangler(
  args: string[],
  options?: { cwd?: string },
): Promise<{ stdout: string; stderr: string }> {
  const result = await spawn("wrangler", args, options);
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

export async function whoami(): Promise<WranglerUser | null> {
  try {
    const result = await wrangler(["whoami"]);
    const line = result.stdout
      .split("\n")
      .find((l: string) => l.includes("You are logged in with the email"));
    if (!line) return null;
    const email = line.match(/['"]([^'"]+)['"]/)?.[1];
    return email ? { email } : null;
  } catch {
    return null;
  }
}

export async function login(): Promise<void> {
  await wrangler(["login"]);
}

export async function createKv(name: string): Promise<{ id: string }> {
  const result = await wrangler(["kv:namespace", "create", name]);
  const parsed = JSON.parse(result.stdout) as { id: string };
  return parsed;
}

export async function createD1(name: string): Promise<{ uuid: string }> {
  const result = await wrangler(["d1", "create", name]);
  const match = result.stdout.match(/database_id\s*=\s*"([a-f0-9-]+)"/i);
  if (!match) {
    const parsed = JSON.parse(result.stdout.slice(result.stdout.indexOf("{"))) as {
      uuid?: string;
      database_id?: string;
    };
    return { uuid: parsed.uuid ?? parsed.database_id ?? "" };
  }
  return { uuid: match[1] };
}

export async function createR2(name: string): Promise<void> {
  await wrangler(["r2", "bucket", "create", name]);
}

export async function putSecret(
  name: string,
  value: string,
  options?: { cwd?: string },
): Promise<void> {
  const proc = spawn("wrangler", ["secret", "put", name], options);
  const childProc = await proc.nodeChildProcess;
  if (childProc.stdin) {
    childProc.stdin.write(value + "\n");
    childProc.stdin.end();
  }
  await proc;
}

export interface DeployResult {
  url?: string;
  version?: string;
  warnings: string[];
}

export async function deploy(options?: { cwd?: string }): Promise<DeployResult> {
  const result = await wrangler(["deploy"], options);
  const warnings: string[] = [];
  let url: string | undefined;
  let version: string | undefined;

  for (const line of result.stdout.split("\n")) {
    const trimmed = line.trim();
    // wrangler outputs: "Published <name> (<version>)"
    const versionMatch = trimmed.match(/Published\s+\S+\s+\(([^)]+)\)/);
    if (versionMatch) {
      version = versionMatch[1];
    }
    // wrangler outputs the deployed URL in various formats
    const urlMatch = trimmed.match(/https?:\/\/[^\s]+/);
    if (urlMatch && !url) {
      url = urlMatch[0];
    }
    if (trimmed.toLowerCase().includes("warning")) {
      warnings.push(trimmed);
    }
  }

  return { url, version, warnings };
}

export async function listSecrets(options?: { cwd?: string }): Promise<string[]> {
  try {
    const result = await wrangler(["secret", "list", "--format", "json"], options);
    const parsed = JSON.parse(result.stdout) as {
      result?: { secrets?: Array<{ name: string }> };
    };
    if (parsed.result?.secrets) {
      return parsed.result.secrets.map((s) => s.name);
    }
  } catch {
    // Fallback: try parsing table output (older wrangler versions)
    try {
      const result = await wrangler(["secret", "list"], options);
      const names: string[] = [];
      for (const line of result.stdout.split("\n")) {
        // Table rows have format: │ NAME │ ... │
        const match = line.match(/│\s*(\w+)\s*│/);
        if (match && match[1] !== "NAME") {
          names.push(match[1]);
        }
      }
      return names;
    } catch {
      return [];
    }
  }
  return [];
}
