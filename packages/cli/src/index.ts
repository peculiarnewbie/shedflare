#!/usr/bin/env node

import { cac } from "cac";

const cli = cac("shedflare");

cli
  .command("dashboard", "Open the local Shedflare console")
  .option("--port <port>", "Port for the dev server", { default: 5174 })
  .action(async (options: { port?: number }) => {
    const { dashboardCommand } = await import("./commands/dashboard.js");
    await dashboardCommand({ port: Number(options.port ?? 5174) });
  });

cli
  .command("init", "Create a new Shedflare workspace and configure apps for deployment")
  .option("--apps <apps>", "Comma-separated list of apps to include (auth,chat,drive)")
  .option("--owner-email <email>", "Email address of the deployment owner")
  .option("--domain <domain>", "Base domain for app subdomains")
  .option("--yes", "Skip all prompts and use defaults")
  .option("--no-tui", "Skip enhanced terminal UI if available")
  .action(async (options) => {
    const { initCommand } = await import("./commands/init.js");
    await initCommand(options);
  });

cli
  .command("deploy [app]", "Deploy apps via Alchemy")
  .option("--yes", "Skip confirmation prompts")
  .option("--secret <pair>", "Set secret for deploy: NAME=value (repeatable)")
  .action(async (app: string | undefined, options: { yes?: boolean }) => {
    const { deployCommand } = await import("./commands/deploy.js");
    await deployCommand({ app, yes: options.yes });
  });

cli
  .command("doctor", "Check the workspace for common issues and missing configuration")
  .option("--json", "Output results as JSON for CI and scripting")
  .action(async (options) => {
    const { doctorCommand } = await import("./commands/doctor.js");
    await doctorCommand(options);
  });

cli
  .command("config [action]", "Manage shedflare.config.jsonc")
  .option("--check", "Fail when migration is required or blocked")
  .option("--write", "Write the migration after confirmation")
  .option("--yes", "Skip the migration write confirmation")
  .option("--json", "Output the migration result as JSON")
  .action(
    async (
      action: string | undefined,
      options: { check?: boolean; write?: boolean; yes?: boolean; json?: boolean },
    ) => {
      if (action !== "migrate") {
        console.error(`Unknown config action: ${action ?? "(none)"}`);
        cli.outputHelp();
        process.exit(1);
      }
      const { configMigrateCommand } = await import("./commands/config.js");
      await configMigrateCommand(options);
    },
  );

cli
  .command("secret <action> <app> [name]", "Set or inspect operator secrets")
  .option("--value <value>", "Secret value (otherwise prompted)")
  .option("--local", "Write only to the repository's ignored .env file")
  .option("--both", "Set the deployed Worker secret and local .env value")
  .action(
    async (
      action: string,
      app: string,
      name: string | undefined,
      options: { value?: string; local?: boolean; both?: boolean },
    ) => {
      const { resolveSecretCommand, secretListCommand, secretSetCommand } =
        await import("./commands/secret.js");
      const command = resolveSecretCommand({
        action,
        app,
        name,
        value: options.value,
        local: options.local,
        both: options.both,
      });
      if (command.action === "set") {
        await secretSetCommand(command);
      } else {
        await secretListCommand(command);
      }
    },
  );

cli.help();
cli.version("0.0.0");

try {
  cli.parse(process.argv, { run: false });
  await cli.runMatchedCommand();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
