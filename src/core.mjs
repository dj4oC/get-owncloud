import { readFile } from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);

export async function loadCatalog(name) {
  return JSON.parse(await readFile(new URL(`catalog/${name}.json`, ROOT), "utf8"));
}

function integerDefault(value, fallback) {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

export async function normalizeProfile(input) {
  const sizing = await loadCatalog("sizing");
  const profile = structuredClone(input);
  const users = profile.workload?.registeredUsers ?? 0;
  profile.maturity ??= profile.purpose === "production" ? "production" : "community-preview";
  profile.workload ??= {};
  profile.workload.peakConcurrentUsers = integerDefault(
    profile.workload.peakConcurrentUsers,
    Math.max(1, Math.ceil(users * sizing.defaults.peakConcurrentPercent / 100))
  );
  profile.workload.collaboraConcurrentUsers = integerDefault(
    profile.workload.collaboraConcurrentUsers,
    profile.office?.mode === "collabora"
      ? Math.max(1, Math.ceil(users * sizing.defaults.collaboraConcurrentPercent / 100))
      : 0
  );
  profile.workload.expectedSpaces = integerDefault(
    profile.workload.expectedSpaces,
    Math.max(1, Math.ceil(users * sizing.defaults.spacesPerUser))
  );
  profile.workload.headroomPercent = integerDefault(
    profile.workload.headroomPercent,
    sizing.defaults.headroomPercent
  );
  profile.features ??= {};
  return profile;
}

export async function validateProfile(raw) {
  const profile = await normalizeProfile(raw);
  const policies = await loadCatalog("policies");
  const compatibility = await loadCatalog("compatibility");
  const errors = [];

  if (profile.apiVersion !== "get.owncloud.com/v1alpha1") errors.push("Unsupported apiVersion");
  if (!["evaluation", "production"].includes(profile.purpose)) errors.push("Purpose must be evaluation or production");
  if (["experimental", undefined].includes(profile.maturity)) errors.push("Experimental or unknown maturity is never deployable");

  const runtime = profile.target?.runtime;
  const manager = profile.target?.manager;
  if (!["docker", "podman", "kubernetes"].includes(runtime)) errors.push("Unsupported runtime");
  if (!["direct", "ansible", "argocd"].includes(manager)) errors.push("Unsupported manager");
  if (manager === "ansible" && !["docker", "podman"].includes(runtime)) errors.push("Ansible wraps the single-host family");
  if (manager === "argocd" && runtime !== "kubernetes") errors.push("Argo CD wraps the Kubernetes/Helm family");

  const users = profile.workload?.registeredUsers;
  if (!Number.isInteger(users) || users < 1) errors.push("registeredUsers must be a positive integer");
  if (profile.identity?.mode === "embedded" && users > policies.identity.embeddedMaximumUsers) {
    errors.push(`Embedded IDP/IDM is limited to ${policies.identity.embeddedMaximumUsers} users`);
  }

  const office = String(profile.office?.mode ?? "").toLowerCase();
  if (!policies.office.allowed.includes(office)) errors.push("Only no office integration or Collabora is allowed");
  if (office === "collabora" && !["bundled", "external"].includes(profile.office?.deployment)) {
    errors.push("Collabora deployment must be bundled or external");
  }

  const storage = String(profile.storage?.mode ?? "").toLowerCase();
  if (policies.storage.denied.includes(storage) || !policies.storage.allowedModes.includes(storage)) {
    errors.push(`Storage mode ${storage || "<missing>"} is denied`);
  }
  if (storage === "nfs" && profile.storage?.nfsVersion !== policies.storage.requiredNfsVersion) {
    errors.push(`NFS must be ${policies.storage.requiredNfsVersion}`);
  }

  const serialized = JSON.stringify(profile).toLowerCase();
  for (const denied of [...policies.storage.denied, "onlyoffice"]) {
    if (serialized.includes(`\"${denied}\"`)) errors.push(`Denied value found: ${denied}`);
  }

  if (runtime === "kubernetes" && !compatibility.helm.runnable) {
    errors.push(`Kubernetes output is blocked: ${compatibility.helm.status}`);
  }
  if (manager === "argocd" && !compatibility.argocd.runnable) {
    errors.push("Argo CD output inherits the blocked Helm compatibility gate");
  }

  return { valid: errors.length === 0, errors: [...new Set(errors)], profile };
}

export function detectEffectiveNfsVersion(mountText) {
  const lines = String(mountText).split(/\r?\n/);
  for (const line of lines) {
    if (!/\bnfs4?\b/i.test(line)) continue;
    const match = line.match(/(?:vers|nfsvers)=([0-9]+(?:\.[0-9]+)?)/i);
    if (match) return match[1];
    if (/\bnfs4\b/i.test(line)) return "4";
  }
  return null;
}

export function assertEffectiveNfs42(mountText) {
  const version = detectEffectiveNfsVersion(mountText);
  return { valid: version === "4.2", version, error: version === "4.2" ? null : "Effective NFSv4.2 could not be proven" };
}

export async function calculateSizing(raw) {
  const profile = await normalizeProfile(raw);
  const rules = await loadCatalog("sizing");
  const contributions = [{ component: "oCIS base", cpu: rules.base.cpu, ramMiB: rules.base.ramMiB }];
  let cpu = rules.base.cpu;
  let ramMiB = rules.base.ramMiB;
  let networkKbit = 0;

  if (profile.office?.mode === "collabora" && profile.office?.deployment === "bundled") {
    const concurrent = profile.workload.collaboraConcurrentUsers;
    const officeCpu = Math.max(rules.collabora.minimumCpu, Math.ceil(concurrent / rules.collabora.usersPerCpuThreadCrossCheck));
    const officeRam = rules.collabora.baseRamMiB + rules.collabora.ramMiBPerConcurrentUser * concurrent;
    const officeNetwork = rules.collabora.networkKbitPerConcurrentUser * concurrent;
    cpu += officeCpu;
    ramMiB += officeRam;
    networkKbit += officeNetwork;
    contributions.push({ component: "Bundled Collabora", cpu: officeCpu, ramMiB: officeRam, networkKbit: officeNetwork });
  }
  if (profile.features?.clamav) {
    cpu += rules.clamav.cpu;
    ramMiB += rules.clamav.recommendedRamMiB;
    contributions.push({ component: "ClamAV", cpu: rules.clamav.cpu, ramMiB: rules.clamav.recommendedRamMiB });
  }

  const minimum = { cpu, ramMiB, networkKbit };
  const headroom = Math.max(30, profile.workload.headroomPercent) / 100;
  const recommended = {
    cpu: Math.ceil(cpu * (1 + headroom)),
    ramMiB: Math.ceil(ramMiB * (1 + headroom) / 256) * 256,
    networkKbit: Math.ceil(networkKbit * (1 + headroom))
  };
  return {
    formulaVersion: rules.version,
    derivedInputs: {
      peakConcurrentUsers: profile.workload.peakConcurrentUsers,
      collaboraConcurrentUsers: profile.workload.collaboraConcurrentUsers,
      expectedSpaces: profile.workload.expectedSpaces
    },
    minimum,
    recommended,
    headroomPercent: headroom * 100,
    headroomBreakdown: rules.headroomBreakdown,
    contributions,
    vocabulary: rules.vocabulary,
    productionLoadTestRequired: true,
    disclaimer: "Recommended includes headroom but is not a capacity guarantee. Production requires representative load testing."
  };
}

export function requiredTools(profile) {
  const tools = [];
  if (profile.target.runtime === "docker") tools.push("docker");
  if (profile.target.runtime === "podman") tools.push("podman");
  if (profile.target.runtime === "kubernetes") tools.push("kubectl", "helm");
  if (profile.target.manager === "ansible") tools.push("ansible");
  if (profile.target.manager === "argocd") tools.push("argocd");
  return tools;
}

export async function buildDeploymentPlan(raw) {
  const checked = await validateProfile(raw);
  const sizing = await calculateSizing(checked.profile);
  return {
    valid: checked.valid,
    errors: checked.errors,
    family: checked.profile.target.runtime === "kubernetes" ? "kubernetes" : "single-host",
    tools: requiredTools(checked.profile),
    profile: checked.profile,
    sizing,
    deterministicSecretMode: "stable-references; values generated separately"
  };
}
