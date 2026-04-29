import { runDoctor } from "../core/validate.js";

export interface DoctorOptions {
  json?: boolean;
}

export async function doctorCommand(options: DoctorOptions): Promise<void> {
  const checks = await runDoctor();

  if (options.json) {
    console.log(
      JSON.stringify(
        { status: checks.every((c) => c.status === "pass") ? "pass" : "fail", checks },
        null,
        2,
      ),
    );
    if (checks.some((c) => c.status === "fail")) {
      process.exit(1);
    }
    return;
  }

  console.log("Shedflare Doctor\n");

  let allPassed = true;

  for (const check of checks) {
    const icon = check.status === "pass" ? "✓" : check.status === "warn" ? "⚠" : "✗";
    if (check.status === "fail") allPassed = false;

    const message = check.message ? ` — ${check.message}` : "";
    console.log(`  ${icon} ${check.name}${message}`);
  }

  console.log("");
  if (allPassed) {
    console.log("All checks passed.");
  } else {
    console.log("Some checks failed. Review the issues above.");
    process.exit(1);
  }
}
