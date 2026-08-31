import { AuthProviders, CredentialsStoreLive, ProfileLive } from "alchemy/Auth";
import { CloudflareEnvironment, fromProfile } from "alchemy/Cloudflare";
import { PlatformServices } from "alchemy/Util/PlatformServices";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { custom, object, parse } from "valibot";
import type { CredentialsStore } from "alchemy/Auth";
import type { CfCredentials } from "./cf-secrets-api.ts";

type CloudflareAuthRequirements = AuthProviders | CredentialsStore;
type CloudflareAuthLayer = Layer.Layer<never, never, CloudflareAuthRequirements>;

const CloudflareAuthModuleSchema = object({
  CloudflareAuth: custom<CloudflareAuthLayer>(Layer.isLayer, "Expected an Alchemy auth layer"),
});

/**
 * Alchemy uses this layer internally for its own Cloudflare subcommands but
 * does not currently export it from a public package subpath. Resolve the
 * module beside the public Cloudflare entrypoint so this small bridge can be
 * deleted as soon as Alchemy exposes the layer directly.
 */
const loadCloudflareAuthLayer = Effect.promise(async () => {
  const cloudflareEntry = import.meta.resolve("alchemy/Cloudflare");
  const extension = cloudflareEntry.endsWith(".ts") ? "ts" : "js";
  const authModule: unknown = await import(
    new URL(`./Auth/AuthProvider.${extension}`, cloudflareEntry).href
  );
  return parse(CloudflareAuthModuleSchema, authModule).CloudflareAuth;
});

/** Resolve the same persisted Cloudflare profile used by Alchemy deployments. */
export function loadCloudflareCredentials(): Promise<CfCredentials> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const cloudflareAuth = yield* loadCloudflareAuthLayer;
      const authRegistry = Layer.succeed(AuthProviders, {});
      const authLayer = cloudflareAuth.pipe(Layer.provideMerge(authRegistry));
      const profileServices = Layer.mergeAll(ProfileLive, CredentialsStoreLive).pipe(
        Layer.provide(PlatformServices),
      );
      const services = fromProfile().pipe(
        Layer.provideMerge(authLayer),
        Layer.provideMerge(profileServices),
        Layer.provideMerge(ConfigProvider.layer(ConfigProvider.fromEnv())),
      );

      return yield* Effect.gen(function* () {
        const resolveCredentials = yield* CloudflareEnvironment;
        return yield* resolveCredentials;
      }).pipe(Effect.provide(services));
    }),
  );
}
