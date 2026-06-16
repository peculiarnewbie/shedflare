import { CloudflareEnvironment } from "alchemy/Cloudflare";
import * as Provider from "alchemy/Provider";
import { Resource } from "alchemy";
import type { Input } from "alchemy/Input";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { listWorkerSecretNames, putWorkerSecret } from "./cf-secrets-api.ts";

export interface WorkerSecretProps {
  workerName: Input<string>;
  binding: string;
  value?: Input<Redacted.Redacted<string>>;
  required?: boolean;
}

export interface WorkerSecretAttributes {
  binding: string;
  present: boolean;
}

export type WorkerSecret = Resource<
  "Shedflare.WorkerSecret",
  WorkerSecretProps,
  WorkerSecretAttributes
>;

export const WorkerSecret = Resource<WorkerSecret>("Shedflare.WorkerSecret");

type ResolvedNews = {
  workerName: string;
  binding: string;
  value?: Redacted.Redacted<string>;
  required?: boolean;
};

function missingSecretMessage(binding: string, workerName: string): string {
  return (
    `Worker secret "${binding}" is not set on ${workerName}. ` +
    `Set ${binding} in the environment for this deploy, or run ` +
    `\`shedflare secret set <app> ${binding}\`.`
  );
}

export const WorkerSecretProvider = () =>
  Provider.succeed(WorkerSecret, {
    reconcile: Effect.fn(function* ({ news }) {
      const resolved = news as ResolvedNews;
      const credentials = yield* yield* CloudflareEnvironment;
      const { accountId } = credentials;
      const { workerName, binding } = resolved;

      const existing = yield* Effect.tryPromise({
        try: () => listWorkerSecretNames(credentials, accountId, workerName),
        catch: (cause) =>
          cause instanceof Error ? cause : new Error("Failed to list worker secrets", { cause }),
      });

      const present = existing.includes(binding);

      if (resolved.value !== undefined) {
        const plaintext = Redacted.value(resolved.value);
        yield* Effect.tryPromise({
          try: () => putWorkerSecret(credentials, accountId, workerName, binding, plaintext),
          catch: (cause) =>
            cause instanceof Error
              ? cause
              : new Error(`Failed to set secret ${binding}`, { cause }),
        });
        return { binding, present: true };
      }

      if (present) {
        return { binding, present: true };
      }

      if (resolved.required !== false) {
        return yield* Effect.fail(new Error(missingSecretMessage(binding, workerName)));
      }

      return { binding, present: false };
    }),

    delete: () => Effect.void,

    read: Effect.fn(function* ({ olds, output }) {
      if (!output?.present) return undefined;
      const credentials = yield* yield* CloudflareEnvironment;
      const { accountId } = credentials;
      const existing = yield* Effect.tryPromise({
        try: () => listWorkerSecretNames(credentials, accountId, olds.workerName as string),
        catch: (cause) => {
          console.error(
            "[WorkerSecret] read failed",
            cause instanceof Error ? cause.message : String(cause),
          );
          return cause instanceof Error
            ? cause
            : new Error("Failed to read worker secrets", { cause });
        },
      }).pipe(
        Effect.match({
          onSuccess: (names) => names,
          onFailure: () => [] as string[],
        }),
      );
      if (!existing.includes(olds.binding)) return undefined;
      return { binding: olds.binding, present: true };
    }),
  });
