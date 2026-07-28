import * as Layer from "effect/Layer";
import * as Provider from "alchemy/Provider";
import type { CloudflareEnvironment } from "alchemy/Cloudflare";
import { WorkerSecret, WorkerSecretProvider } from "./WorkerSecret.ts";

export class ShedflareProviders extends Provider.ProviderCollection()("Shedflare") {}

export const providers = (): Layer.Layer<
  ShedflareProviders | Provider.Provider<WorkerSecret>,
  never,
  CloudflareEnvironment | import("alchemy").StackServices
> =>
  Layer.effect(ShedflareProviders, Provider.collection([WorkerSecret])).pipe(
    Layer.provideMerge(WorkerSecretProvider()),
  );
