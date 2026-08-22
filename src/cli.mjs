#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { buildDeploymentPlan } from "./core.mjs";

const [profilePath, outputPath = "deployment-plan.json"] = process.argv.slice(2);
if (!profilePath) {
  console.error("Usage: node src/cli.mjs PROFILE.json [OUTPUT.json]");
  process.exit(2);
}

const profile = JSON.parse(await readFile(profilePath, "utf8"));
const plan = await buildDeploymentPlan(profile);
await writeFile(outputPath, `${JSON.stringify(plan, null, 2)}\n`, { mode: 0o600 });
if (!plan.valid) {
  console.error(plan.errors.join("\n"));
  process.exit(1);
}
console.log(`Wrote ${outputPath}`);
