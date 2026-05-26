import * as Layer from "effect/Layer";
import * as Provider from "alchemy/Provider";
import { WorkerSecret, WorkerSecretProvider } from "./WorkerSecret.ts";

export class ShedflareProviders extends Provider.ProviderCollection()("Shedflare") {}

export const providers = () =>
  Layer.effect(ShedflareProviders, Provider.collection([WorkerSecret])).pipe(
    Layer.provideMerge(WorkerSecretProvider()),
  );
