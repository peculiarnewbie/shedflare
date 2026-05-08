#!/usr/bin/env node
/**
 * Money deployment script.
 * Builds the SPA and deploys with wrangler.
 */
import { execSync } from "node:child_process";

console.log("Building SPA...");
execSync("vp build", { stdio: "inherit", cwd: import.meta.dirname });

console.log("Deploying with wrangler...");
execSync("npx wrangler deploy", { stdio: "inherit", cwd: import.meta.dirname });

console.log("Deploy complete!");
