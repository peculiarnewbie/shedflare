import { multiselect, text, password, confirm, isCancel, cancel } from "@clack/prompts";
import type { AppId } from "../core/manifests.js";
import { APP_IDS, loadManifest } from "../core/manifests.js";

export async function selectApps(): Promise<AppId[]> {
  const manifests = APP_IDS.map((id) => {
    try {
      return loadManifest(id);
    } catch {
      console.warn(`[prompts] Failed to load manifest for ${id}`);
      return null;
    }
  });

  const result = await multiselect({
    message: "Which apps would you like to deploy?",
    options: manifests
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .map((m) => ({
        value: m.id,
        label: m.name,
        hint: m.description,
      })),
    required: true,
  });

  if (isCancel(result)) {
    cancel("Operation cancelled");
    process.exit(0);
  }

  return result as AppId[];
}

export async function askEmail(): Promise<string> {
  const result = await text({
    message: "What is your email address?",
    placeholder: "you@example.com",
    validate: (value: string | undefined) => {
      if (!value || !value.includes("@")) return "Please enter a valid email address";
    },
  });

  if (isCancel(result) || result === undefined) {
    cancel("Operation cancelled");
    process.exit(0);
  }

  return result;
}

export async function askDomain(): Promise<string> {
  const result = await text({
    message: "What domain will your apps use?",
    placeholder: "example.com",
    validate: (value: string | undefined) => {
      if (!value || !value.includes(".")) return "Please enter a valid domain (e.g., example.com)";
    },
  });

  if (isCancel(result) || result === undefined) {
    cancel("Operation cancelled");
    process.exit(0);
  }

  return result;
}

export async function askSubdomain(appId: AppId, defaultSubdomain: string): Promise<string> {
  const result = await text({
    message: `Subdomain for ${appId}`,
    placeholder: defaultSubdomain,
  });

  if (isCancel(result) || result === undefined) {
    cancel("Operation cancelled");
    process.exit(0);
  }

  return result || defaultSubdomain;
}

export async function askVar(
  _key: string,
  description: string,
  defaultValue?: string,
): Promise<string> {
  const result = await text({
    message: description,
    placeholder: defaultValue,
  });

  if (isCancel(result) || result === undefined) {
    cancel("Operation cancelled");
    process.exit(0);
  }

  return result || defaultValue || "";
}

export async function askSecret(_key: string, description: string): Promise<string> {
  const result = await password({
    message: description,
  });

  if (isCancel(result) || result === undefined) {
    cancel("Operation cancelled");
    process.exit(0);
  }

  return result;
}

export async function askConfirm(message: string, initialValue = true): Promise<boolean> {
  const result = await confirm({
    message,
    initialValue,
  });

  if (isCancel(result) || result === undefined) {
    cancel("Operation cancelled");
    process.exit(0);
  }

  return result;
}
