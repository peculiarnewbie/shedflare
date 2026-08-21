import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Shedflare from "@shedflare/alchemy";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

function optionalWorkerSecret<WorkerName, Value>(
  workerName: WorkerName,
  binding: string,
  required: boolean,
  value: Option.Option<Value>,
) {
  if (Option.isSome(value)) return { workerName, binding, required, value: value.value };
  return { workerName, binding, required };
}

export const DiscordStack = Alchemy.Stack(
  "ShedflareDiscord",
  {
    providers: Shedflare.providers().pipe(Layer.provideMerge(Cloudflare.providers())),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    const config = yield* Shedflare.appConfig("discord");

    const discordGateway = Cloudflare.Workers.DurableObject<unknown>("DISCORD_GATEWAY", {
      className: "DiscordGatewayDurableObject",
    });

    const channelConversation = Cloudflare.Workers.DurableObject<unknown>("CHANNEL_CONVERSATION", {
      className: "ChannelConversationDurableObject",
    });

    const worker = yield* Cloudflare.Worker("DiscordWorker", {
      name: Shedflare.physicalName(stage, "discord"),
      main: "apps/discord/src/worker.ts",
      compatibility: {
        date: "2026-03-22",
        flags: ["nodejs_compat"],
      },
      crons: ["*/5 * * * *"],
      env: {
        DISCORD_GATEWAY: discordGateway,
        CHANNEL_CONVERSATION: channelConversation,
        APP_PUBLIC_URL: config.url,
        DEFAULT_MODEL_ID: Shedflare.optionalVar(config, "DEFAULT_MODEL_ID", "auto"),
        OWNER_DISCORD_USER_ID: Shedflare.optionalVar(config, "OWNER_DISCORD_USER_ID", ""),
        SEARCH_ENABLED: Shedflare.optionalVar(config, "SEARCH_ENABLED", "true"),
        PREFER_FREE_SEARCH: Shedflare.optionalVar(config, "PREFER_FREE_SEARCH", "false"),
      },
      domain: config.url.startsWith("https://") ? new URL(config.url).hostname : undefined,
    });

    const gatewayWebhookSecret = yield* Alchemy.Random("GATEWAY_WEBHOOK_SECRET");
    const gatewayAdminSecret = yield* Alchemy.Random("GATEWAY_ADMIN_SECRET");
    const botToken = yield* Shedflare.optionalSecretConfig("DISCORD_BOT_TOKEN");
    const opencodeKey = yield* Shedflare.optionalSecretConfig("OPENCODE_GO_API_KEY");
    const exaKey = yield* Shedflare.optionalSecretConfig("EXA_API_KEY");
    const publicKey = yield* Shedflare.optionalSecretConfig("DISCORD_PUBLIC_KEY");

    yield* Shedflare.WorkerSecret(
      "DiscordBotToken",
      optionalWorkerSecret(worker.workerName, "DISCORD_BOT_TOKEN", true, botToken),
    );

    yield* Shedflare.WorkerSecret(
      "OpencodeKey",
      optionalWorkerSecret(worker.workerName, "OPENCODE_GO_API_KEY", true, opencodeKey),
    );

    yield* Shedflare.WorkerSecret(
      "ExaKey",
      optionalWorkerSecret(worker.workerName, "EXA_API_KEY", false, exaKey),
    );

    yield* Shedflare.WorkerSecret("GatewayWebhookSecret", {
      workerName: worker.workerName,
      binding: "GATEWAY_WEBHOOK_SECRET",
      value: gatewayWebhookSecret.text,
    });

    yield* Shedflare.WorkerSecret("GatewayAdminSecret", {
      workerName: worker.workerName,
      binding: "GATEWAY_ADMIN_SECRET",
      value: gatewayAdminSecret.text,
    });

    yield* Shedflare.WorkerSecret(
      "DiscordPublicKey",
      optionalWorkerSecret(worker.workerName, "DISCORD_PUBLIC_KEY", false, publicKey),
    );

    return {
      app: "discord" as const,
      url: worker.url ?? config.url,
      configuredUrl: config.url,
      workerName: worker.workerName,
    };
  }),
);

export default DiscordStack;
