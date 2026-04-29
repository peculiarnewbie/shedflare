#!/usr/bin/env node

import { cac } from "cac";

const cli = cac("shedflare");

cli
  .command("init", "Create a new Shedflare workspace and configure apps for deployment")
  .option("--apps <apps>", "Comma-separated list of apps to include (auth,chat,drive)")
  .option("--owner-email <email>", "Email address of the deployment owner")
  .option("--domain <domain>", "Base domain for app subdomains")
  .option("--yes", "Skip all prompts and use defaults")
  .option("--mock-resources", "Generate fake resource IDs instead of provisioning")
  .option("--no-tui", "Skip enhanced terminal UI if available")
  .action(async (options) => {
    const { initCommand } = await import("./commands/init.js");
    await initCommand(options);
  });

cli
  .command(
    "configure",
    "Generate wrangler.jsonc files from shedflare.config.jsonc and app manifests",
  )
  .option("--check", "Validate that generated configs are up-to-date instead of writing them")
  .option("--app <app>", "Only configure a specific app")
  .action(async (options) => {
    const { configureCommand } = await import("./commands/configure.js");
    await configureCommand(options);
  });

cli
  .command("doctor", "Check the workspace for common issues and missing configuration")
  .option("--json", "Output results as JSON for CI and scripting")
  .action(async (options) => {
    const { doctorCommand } = await import("./commands/doctor.js");
    await doctorCommand(options);
  });

cli.help();
cli.version("0.0.0");

try {
  cli.parse(process.argv, { run: false });
  await cli.runMatchedCommand();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
