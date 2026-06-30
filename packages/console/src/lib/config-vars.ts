const SENSITIVE_VAR_PATTERN = /(^|_)(API_KEY|CLIENT_SECRET|PASSWORD|PRIVATE_KEY|SECRET|TOKEN)$/;

export function isSensitiveVarName(name: string): boolean {
  return SENSITIVE_VAR_PATTERN.test(name);
}

export function editableVars(vars: Record<string, string> | undefined): Record<string, string> {
  return Object.fromEntries(Object.entries(vars ?? {}).filter(([key]) => !isSensitiveVarName(key)));
}

export function hiddenSensitiveVarNames(vars: Record<string, string> | undefined): string[] {
  return Object.keys(vars ?? {})
    .filter(isSensitiveVarName)
    .sort();
}
