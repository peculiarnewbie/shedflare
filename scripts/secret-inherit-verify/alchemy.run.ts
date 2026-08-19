import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { physicalName } from "../../infra/alchemy-env.ts";

/**
 * Minimal stack for verifying whether operator secrets survive deploy when omitted
 * from the Worker env block. Controlled by SHEDFLARE_VERIFY_INCLUDE_SECRET=1.
 */
export default Alchemy.Stack(
  "ShedflareSecretInheritVerify",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    const includeSecret = process.env.SHEDFLARE_VERIFY_INCLUDE_SECRET === "1";

    const worker = includeSecret
      ? yield* Cloudflare.Worker("VerifyWorker", {
          name: physicalName(stage, "secret-verify"),
          main: "scripts/secret-inherit-verify/worker.ts",
          compatibility: { date: "2026-03-22", flags: ["nodejs_compat"] },
          env: {
            PLAIN: "pattern-b-verify",
            TEST_SECRET: Redacted.make(
              process.env.TEST_SECRET ?? "shedflare-pattern-b-verify-secret",
            ),
          },
          url: true,
        })
      : yield* Cloudflare.Worker("VerifyWorker", {
          name: physicalName(stage, "secret-verify"),
          main: "scripts/secret-inherit-verify/worker.ts",
          compatibility: { date: "2026-03-22", flags: ["nodejs_compat"] },
          env: { PLAIN: "pattern-b-verify" },
          url: true,
        });

    return {
      workerName: worker.workerName,
      url: worker.url,
      includedSecret: includeSecret,
    };
  }),
);
