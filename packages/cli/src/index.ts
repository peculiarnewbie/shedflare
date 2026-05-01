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
  .command("add <app>", "Add an app to an existing workspace")
  .option("--subdomain <subdomain>", "Subdomain for the app")
  .option("--yes", "Skip all prompts and use defaults")
  .option("--mock-resources", "Generate fake resource IDs instead of provisioning")
  .action(async (options) => {
    const { addCommand } = await import("./commands/add.js");
    await addCommand(options);
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
  .command("provision", "Idempotently create missing Cloudflare resources for enabled apps")
  .option("--app <app>", "Only provision resources for a specific app")
  .option("--mock-resources", "Generate fake resource IDs instead of provisioning")
  .action(async (options) => {
    const { provisionCommand } = await import("./commands/provision.js");
    await provisionCommand(options);
  });

cli
  .command("doctor", "Check the workspace for common issues and missing configuration")
  .option("--json", "Output results as JSON for CI and scripting")
  .action(async (options) => {
    const { doctorCommand } = await import("./commands/doctor.js");
    await doctorCommand(options);
  });

cli
  .command("deploy [app]", "Build and deploy apps to Cloudflare")
  .option("--verify", "Verify each app URL is reachable after deploy")
  .option("--yes", "Skip confirmation prompts")
  .action(async (options) => {
    const { deployCommand } = await import("./commands/deploy.js");
    await deployCommand(options);
  });

cli.command("youtube", "YouTube integration commands").action(async (options) => {
  const { youtubeCommand } = await import("./commands/youtube.js");
  await youtubeCommand(options);
});

cli
  .command("youtube sync", "Fetch YouTube Watch Later and notifications data and sync to dashboard")
  .option("--watch-only", "Only sync Watch Later")
  .option("--notif-only", "Only sync notifications")
  .action(async (options) => {
    const { youtubeSyncCommand } = await import("./commands/youtube.js");
    await youtubeSyncCommand(options);
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
