import spawn from "nano-spawn";

export interface DashboardOptions {
  port?: number;
}

export async function dashboardCommand(options: DashboardOptions): Promise<void> {
  const port = options.port ?? 5174;
  console.log(`Starting Shedflare console at http://localhost:${port}`);
  console.log("Set CF_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in your environment.\n");

  await spawn("pnpm", ["--filter", "@shedflare/console", "dev"], {
    stdio: "inherit",
    env: {
      ...process.env,
      CONSOLE_PORT: String(port),
    },
  });
}
