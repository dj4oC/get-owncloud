#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { buildDeploymentPlan, validateProfile } from "./core.mjs";
import { renderProfile } from "./render.mjs";

function usage() {
  console.error("Usage:");
  console.error("  node src/cli.mjs validate PROFILE.json");
  console.error("  node src/cli.mjs plan PROFILE.json [OUTPUT.json]");
  console.error("  node src/cli.mjs render PROFILE.json OUTPUT_DIR --accept-eula [--secrets-file FILE]");
}

function secret() {
  return randomBytes(32).toString("base64url");
}

async function loadJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function ensureEmpty(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const existing = await readdir(path);
  if (existing.length) throw new Error("Output directory must be empty: " + path);
}

const args = process.argv.slice(2);
let command = args.shift();
if (!["validate", "plan", "render"].includes(command)) {
  if (command) args.unshift(command);
  command = "plan";
}
const profilePath = args.shift();
if (!profilePath) {
  usage();
  process.exit(2);
}

try {
  const profile = await loadJson(profilePath);
  if (command === "validate") {
    const result = await validateProfile(profile);
    if (!result.valid) throw new Error(result.errors.join("\n"));
    console.log("Profile is valid");
  } else if (command === "plan") {
    const outputPath = args.shift() ?? "deployment-plan.json";
    const plan = await buildDeploymentPlan(profile);
    await writeFile(outputPath, JSON.stringify(plan, null, 2) + "\n", { mode: 0o600 });
    if (!plan.valid) throw new Error(plan.errors.join("\n"));
    console.log("Wrote " + outputPath);
  } else {
    const outputDirectory = args.shift();
    if (!outputDirectory) throw new Error("render requires an output directory");
    let accepted = false;
    let secretsPath = null;
    while (args.length) {
      const option = args.shift();
      if (option === "--accept-eula") accepted = true;
      else if (option === "--secrets-file") secretsPath = args.shift();
      else throw new Error("Unknown render option: " + option);
    }
    if (!accepted) throw new Error("Explicit --accept-eula is required to render a runnable bundle");
    const supplied = secretsPath ? await loadJson(secretsPath) : {};
    const checked = await validateProfile(profile);
    if (!checked.valid) throw new Error(checked.errors.join("\n"));
    if (checked.profile.storage.mode === "s3ng" && (!supplied.s3AccessKey || !supplied.s3SecretKey)) {
      throw new Error("s3ng rendering requires s3AccessKey and s3SecretKey in --secrets-file");
    }
    if (checked.profile.mail?.username && !supplied.smtpPassword) {
      throw new Error("Authenticated SMTP rendering requires smtpPassword in --secrets-file");
    }
    if (checked.profile.target.runtime !== "kubernetes" && checked.profile.identity.mode === "external-oidc" && !supplied.ldapBindPassword) {
      throw new Error("External identity rendering requires ldapBindPassword in --secrets-file");
    }
    if (checked.profile.aiProxy?.enabled && checked.profile.target.runtime !== "kubernetes" && !supplied.aiProxyApiKey) {
      throw new Error("AI Proxy rendering requires aiProxyApiKey in --secrets-file for Docker/Podman");
    }
    if (checked.profile.aiProxy?.enabled && checked.profile.target.runtime === "kubernetes" && !checked.profile.aiProxy.apiKeySecretRef) {
      throw new Error("Kubernetes AI Proxy requires apiKeySecretRef in profile");
    }
    await ensureEmpty(outputDirectory);
    const epoch = process.env.SOURCE_DATE_EPOCH;
    const acceptedAt = epoch ? new Date(Number(epoch) * 1000).toISOString() : new Date().toISOString();
    const result = await renderProfile({
      rawProfile: checked.profile,
      outputDirectory,
      secrets: {
        adminPassword: supplied.adminPassword ?? secret(),
        collaboraAdminPassword: supplied.collaboraAdminPassword ?? secret(),
        smtpPassword: supplied.smtpPassword ?? "",
        s3AccessKey: supplied.s3AccessKey ?? "",
        s3SecretKey: supplied.s3SecretKey ?? "",
        ldapBindPassword: supplied.ldapBindPassword ?? ""
      },
      acceptance: {
        acceptedAt,
        acceptedBy: process.env.USER || process.env.USERNAME || "local-cli-user"
      }
    });
    console.log("Rendered " + Object.keys(result.files).length + " files into " + outputDirectory);
    console.log("The runtime still requires a separate --accept-eula acknowledgement before start.");
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
