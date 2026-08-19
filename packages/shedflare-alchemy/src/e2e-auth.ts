export interface E2eAuthBindings {
  readonly E2E_AUTH_EMAIL: string;
  readonly E2E_AUTH_TOKEN: string;
}

export function resolveE2eAuthBindings(options: {
  readonly stage: string;
  readonly email?: string;
  readonly token?: string;
  readonly appId: string;
}): E2eAuthBindings | undefined {
  const { stage, email, token, appId } = options;
  const isE2eStage = stage.startsWith("e2e-");
  const hasAnyCredential = email !== undefined || token !== undefined;

  if (!isE2eStage && hasAnyCredential) {
    throw new Error(`${appId}: E2E authentication variables are forbidden for stage "${stage}".`);
  }
  if ((email === undefined) !== (token === undefined)) {
    throw new Error(`${appId}: E2E authentication requires both email and token.`);
  }
  return isE2eStage && email !== undefined && token !== undefined
    ? { E2E_AUTH_EMAIL: email, E2E_AUTH_TOKEN: token }
    : undefined;
}
