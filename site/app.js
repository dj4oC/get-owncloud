import {
  calculateSizingWithRules,
  normalizeProfileWithRules,
  validateNormalizedProfile
} from "../src/core.mjs";
import { buildSingleHostBundle, requiredTemplatePaths } from "../src/bundle.mjs";
import { buildKubernetesBundle, requiredKubernetesTemplatePaths } from "../src/kubernetes.mjs";
import { createZip } from "./zip.mjs";

const form = document.querySelector("#deployment-form");
const output = document.querySelector("#sizing-output");
const breakdown = document.querySelector("#sizing-breakdown");
const errorsBox = document.querySelector("#validation-errors");
const eula = document.querySelector("#eula");
const generate = document.querySelector("#generate");
const status = document.querySelector("#generate-status");
const runtime = document.querySelector("#runtime");
const purpose = document.querySelector("#purpose");
const manager = document.querySelector("#manager");
const identityMode = document.querySelector("#identity-mode");
const usersInput = document.querySelector("#registered-users");
const autoUpdates = document.querySelector("#auto-updates");
let autoUpdatesTouched = false;
autoUpdates.addEventListener("change", () => { autoUpdatesTouched = true; });

const catalogUrl = (name) => new URL(`../catalog/${name}.json`, import.meta.url);
async function fetchJson(name) {
  const response = await fetch(catalogUrl(name));
  if (!response.ok) throw new Error(`Unable to load ${name} policy catalogue`);
  return response.json();
}

const [sizingRules, policies, compatibility, legal, sources] = await Promise.all([
  fetchJson("sizing"), fetchJson("policies"), fetchJson("compatibility"), fetchJson("legal"), fetchJson("sources.lock")
]);

const field = (name) => form.elements.namedItem(name);
const value = (name) => String(field(name)?.value ?? "").trim();
const number = (name) => Number(value(name));
const checked = (name) => Boolean(field(name)?.checked);
const optionalNumber = (name) => value(name) === "" ? null : Number(value(name));

function randomSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function profileFromForm() {
  const isKubernetes = runtime.value === "kubernetes";
  const profile = {
    apiVersion: "get.owncloud.com/v1alpha1",
    purpose: purpose.value,
    maturity: purpose.value === "production" && runtime.value === "docker" ? "production" : "community-preview",
    ocisVersion: isKubernetes ? "7.1.4" : "8.2.0",
    target: { runtime: runtime.value, manager: manager.value },
    workload: {
      registeredUsers: number("registeredUsers"),
      storedDataGiB: number("storedDataGiB"),
      annualGrowthPercent: number("annualGrowthPercent")
    },
    identity: { mode: identityMode.value },
    storage: {
      mode: value("storageMode"),
      filesystem: value("filesystem"),
      dataPath: value("dataPath") || "./data/data",
      configPath: value("configPath") || "./data/config"
    },
    office: { mode: value("officeMode") },
    networking: {
      domain: value("domain"),
      httpPort: number("httpPort") || (purpose.value === "production" ? 80 : 8080),
      httpsPort: number("httpsPort") || (purpose.value === "production" ? 443 : 8443),
      tls: { mode: value("tlsMode") }
    },
    features: {
      search: checked("search"),
      clamav: checked("clamav"),
      notifications: checked("notifications"),
      monitoring: false
    },
    security: { basicAuth: purpose.value === "evaluation", demoUsers: false },
    updates: {
      automaticSecurityPatches: checked("autoUpdates"),
      observationDelayHours: number("updateDelay"),
      backupRecipient: value("backupRecipient")
    }
  };

  const collaboraConcurrency = optionalNumber("collaboraConcurrentUsers");
  if (collaboraConcurrency !== null) profile.workload.collaboraConcurrentUsers = collaboraConcurrency;
  const systemValues = [optionalNumber("systemCpu"), optionalNumber("systemRamGiB"), optionalNumber("systemDiskGiB")];
  if (systemValues.every((item) => item !== null)) {
    profile.system = { cpu: systemValues[0], ramMiB: Math.round(systemValues[1] * 1024), diskGiB: systemValues[2] };
  }

  if (identityMode.value === "external-oidc") {
    Object.assign(profile.identity, {
      issuer: value("oidcIssuer"),
      clientId: value("oidcClientId"),
      ldapUri: value("ldapUri"),
      ldapBindDn: value("ldapBindDn"),
      ldapUserBaseDn: value("ldapUserBaseDn"),
      ldapGroupBaseDn: value("ldapGroupBaseDn")
    });
    if (isKubernetes) profile.identity.ldapSecretRef = value("ldapSecretRef");
  }

  if (profile.storage.filesystem === "nfs") {
    profile.storage.nfsVersion = "4.2";
    if (isKubernetes) profile.storage.storageClassName = value("storageClassName");
  } else if (isKubernetes && value("storageClassName")) {
    profile.storage.storageClassName = value("storageClassName");
  }
  if (profile.storage.mode === "s3ng") {
    profile.storage.s3 = {
      endpoint: value("s3Endpoint"),
      region: value("s3Region"),
      bucket: value("s3Bucket"),
      accessKeyReference: value("s3SecretRef"),
      secretKeyReference: value("s3SecretRef")
    };
  }

  if (profile.office.mode === "collabora") {
    profile.office.deployment = value("officeDeployment");
    if (profile.office.deployment === "external") profile.office.url = value("collaboraUrl");
    else profile.networking.collaboraDomain = value("collaboraDomain");
  }
  if (value("tlsMode") === "acme" && !isKubernetes) profile.networking.tls.email = value("acmeEmail");
  if (isKubernetes) {
    profile.networking.ingressClassName = value("ingressClassName");
    profile.networking.tlsSecretName = value("tlsSecretName");
  }
  if (profile.features.notifications) {
    profile.mail = {
      host: value("smtpHost"),
      port: number("smtpPort"),
      sender: value("smtpSender"),
      username: value("smtpUsername"),
      authentication: value("smtpUsername") ? "login" : "none",
      insecure: false
    };
  }
  return normalizeProfileWithRules(profile, sizingRules);
}

function localSecretErrors(profile) {
  const errors = [];
  const system = [value("systemCpu"), value("systemRamGiB"), value("systemDiskGiB")];
  if (system.some(Boolean) && !system.every(Boolean)) errors.push("Enter all three optional host resource values or leave all three empty");
  if (profile.target.runtime !== "kubernetes" && profile.identity.mode === "external-oidc" && !value("ldapBindPassword")) {
    errors.push("A local LDAP bind password is required for the single-host external identity bundle");
  }
  if (profile.target.runtime !== "kubernetes" && profile.storage.mode === "s3ng" && (!value("s3AccessKey") || !value("s3SecretKey"))) {
    errors.push("Single-host s3ng requires both S3 access and secret keys");
  }
  if (profile.features.notifications && profile.mail.username && !value("smtpPassword")) {
    errors.push("Authenticated SMTP requires a password");
  }
  return errors;
}

function renderErrors(errors) {
  errorsBox.replaceChildren();
  errorsBox.hidden = errors.length === 0;
  if (!errors.length) return;
  const heading = document.createElement("strong");
  heading.textContent = "Resolve these checks before generation:";
  const list = document.createElement("ul");
  for (const message of errors) {
    const item = document.createElement("li");
    item.textContent = message;
    list.append(item);
  }
  errorsBox.append(heading, list);
}

function resourceText(resource) {
  return `${resource.cpu} CPU · ${Math.ceil(resource.ramMiB / 1024)} GiB RAM · ${resource.diskGiB} GiB disk`;
}

function renderSizing(profile, sizing) {
  const identity = profile.identity.mode === "embedded"
    ? "Embedded identity is eligible at this user count."
    : "External OIDC and LDAP are required for this profile.";
  output.textContent = `${identity} Production capacity still requires representative load and recovery testing.`;
  breakdown.replaceChildren();
  const metrics = document.createElement("div");
  metrics.className = "metric-grid";
  for (const [label, recommendation] of [["Calculated minimum", sizing.minimum], ["Recommended with headroom", sizing.recommended]]) {
    const card = document.createElement("div");
    card.className = "metric";
    const title = document.createElement("span");
    title.textContent = label;
    const amount = document.createElement("strong");
    amount.textContent = resourceText(recommendation);
    card.append(title, amount);
    metrics.append(card);
  }
  const list = document.createElement("ul");
  list.className = "breakdown";
  for (const item of sizing.contributions) {
    const row = document.createElement("li");
    row.textContent = `${item.component}: +${item.cpu} CPU, +${Math.ceil(item.ramMiB / 1024 * 10) / 10} GiB RAM, +${item.diskGiB} GiB service disk`;
    list.append(row);
  }
  if (sizing.systemComparison) {
    const comparison = document.createElement("li");
    comparison.textContent = `Entered host comparison — CPU: ${sizing.systemComparison.cpu}; RAM: ${sizing.systemComparison.ram}; disk: ${sizing.systemComparison.disk}.`;
    list.append(comparison);
  }
  breakdown.append(metrics, list);
}

let latest = null;
function validateCurrent({ reveal = false } = {}) {
  const profile = profileFromForm();
  const checkedProfile = validateNormalizedProfile(profile, policies, compatibility);
  const errors = [...checkedProfile.errors, ...localSecretErrors(profile)];
  const sizing = calculateSizingWithRules(profile, sizingRules);
  latest = { valid: errors.length === 0, errors, profile, sizing };
  renderSizing(profile, sizing);
  if (reveal || errorsBox.hidden === false) renderErrors(errors);
  generate.disabled = !(latest.valid && eula.checked);
  if (latest.valid && eula.checked) status.textContent = "Validated locally. The runnable bundle is ready to download.";
  else if (!latest.valid) status.textContent = "The profile is not yet valid; review the checks above.";
  else status.textContent = "Accept the current EULA to enable generation.";
  return latest;
}

function option(value, label) {
  const item = document.createElement("option");
  item.value = value;
  item.textContent = label;
  return item;
}

function syncUi() {
  const isKubernetes = runtime.value === "kubernetes";
  const isProduction = purpose.value === "production";
  const previousManager = manager.value;
  manager.replaceChildren(
    option("direct", isKubernetes ? "Helm" : "Direct"),
    option(isKubernetes ? "argocd" : "ansible", isKubernetes ? "Argo CD" : "Ansible")
  );
  if ([...manager.options].some((item) => item.value === previousManager)) manager.value = previousManager;
  document.querySelectorAll("[data-kubernetes]").forEach((item) => { item.hidden = !isKubernetes; });
  document.querySelectorAll("[data-single-host]").forEach((item) => { item.hidden = isKubernetes; });

  const productionOption = [...purpose.options].find((item) => item.value === "production");
  productionOption.disabled = isKubernetes || runtime.value === "podman";
  if (productionOption.disabled && purpose.value === "production") purpose.value = "evaluation";
  document.querySelector("#maturity-note").textContent = isKubernetes
    ? "Community Preview: chart 0.7.0 and oCIS 7.1.4 stay pinned; issue #6 remains open."
    : runtime.value === "podman"
      ? "Podman is runnable Community Preview until its full parity matrix passes."
      : "Docker is the production-gated single-host path; production still depends on launch gates and load testing.";

  const users = Number(usersInput.value);
  const embeddedOption = [...identityMode.options].find((item) => item.value === "embedded");
  embeddedOption.disabled = users > policies.identity.embeddedMaximumUsers;
  if (embeddedOption.disabled) identityMode.value = "external-oidc";
  document.querySelector("#external-identity").hidden = identityMode.value !== "external-oidc";

  const s3 = value("storageMode") === "s3ng";
  document.querySelector("#s3-fields").hidden = !s3;
  const nfs = value("filesystem") === "nfs";
  document.querySelector("#storage-class-field").hidden = !(isKubernetes && nfs);

  const office = value("officeMode") === "collabora";
  document.querySelector("#office-deployment-field").hidden = !office;
  document.querySelector("#collabora-concurrency-field").hidden = !office;
  if (isKubernetes && office) field("officeDeployment").value = "external";
  [...field("officeDeployment").options].find((item) => item.value === "bundled").disabled = isKubernetes;
  const bundled = office && value("officeDeployment") === "bundled";
  document.querySelector("#collabora-domain-field").hidden = !bundled;
  document.querySelector("#collabora-password-field").hidden = !bundled;
  document.querySelector("#collabora-url-field").hidden = !(office && !bundled);

  if (isKubernetes) {
    field("clamav").checked = false;
    field("clamav").disabled = true;
  } else field("clamav").disabled = false;
  field("autoUpdates").disabled = isKubernetes || runtime.value === "podman";
  if (field("autoUpdates").disabled) field("autoUpdates").checked = false;
  else if (!autoUpdatesTouched) field("autoUpdates").checked = isProduction;
  document.querySelector("#mail-fields").hidden = !checked("notifications");
  document.querySelector("#backup-recipient-field").hidden = !checked("autoUpdates");
  document.querySelector("#acme-email-field").hidden = value("tlsMode") !== "acme" || isKubernetes;

  if (isProduction) {
    field("httpPort").value = "80";
    field("httpsPort").value = "443";
    field("tlsMode").value = "acme";
    document.querySelector("#acme-email-field").hidden = false;
  }
}

let validationTimer;
form.addEventListener("input", () => {
  syncUi();
  clearTimeout(validationTimer);
  validationTimer = setTimeout(() => validateCurrent(), 100);
});
form.addEventListener("change", () => { syncUi(); validateCurrent(); });
form.addEventListener("submit", (event) => {
  event.preventDefault();
  syncUi();
  const result = validateCurrent({ reveal: true });
  if (!form.reportValidity() || !result.valid) errorsBox.scrollIntoView({ behavior: "smooth", block: "center" });
});

eula.addEventListener("change", () => validateCurrent({ reveal: true }));

async function loadTemplates(profile) {
  const paths = profile.target.runtime === "kubernetes"
    ? requiredKubernetesTemplatePaths()
    : requiredTemplatePaths(profile);
  const entries = await Promise.all(paths.map(async (path) => {
    const response = await fetch(new URL(`../${path}`, import.meta.url));
    if (!response.ok) throw new Error(`Bundle template is unavailable: ${path}`);
    return [path, await response.text()];
  }));
  return Object.fromEntries(entries);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

document.querySelector("#download-profile").addEventListener("click", () => {
  const result = validateCurrent({ reveal: true });
  if (!result.valid) return;
  downloadBlob(new Blob([JSON.stringify(result.profile, null, 2) + "\n"], { type: "application/json" }), "owncloud-deployment-profile.json");
});

generate.addEventListener("click", async () => {
  const result = validateCurrent({ reveal: true });
  if (!result.valid || !eula.checked) return;
  generate.disabled = true;
  status.textContent = "Generating secrets, checksums and ZIP locally…";
  try {
    const templates = await loadTemplates(result.profile);
    const inputs = {
      profile: result.profile,
      sizing: result.sizing,
      templates,
      legal,
      sources,
      acceptance: { acceptedAt: new Date().toISOString(), acceptedBy: "browser-local-user" },
      secrets: {
        adminPassword: value("adminPassword") || randomSecret(),
        collaboraAdminPassword: value("collaboraAdminPassword") || randomSecret(),
        smtpPassword: value("smtpPassword"),
        ldapBindPassword: value("ldapBindPassword"),
        s3AccessKey: value("s3AccessKey"),
        s3SecretKey: value("s3SecretKey")
      }
    };
    const files = result.profile.target.runtime === "kubernetes"
      ? await buildKubernetesBundle(inputs)
      : await buildSingleHostBundle(inputs);
    const zip = createZip(files);
    const target = result.profile.target.runtime === "kubernetes" ? "kubernetes-7.1.4" : `${result.profile.target.runtime}-8.2.0`;
    downloadBlob(zip, `get-owncloud-${target}.zip`);
    status.textContent = `Downloaded ${Object.keys(files).length} inspectable files. Extract, review README.md and run Part 1 before deployment.`;
  } catch (error) {
    status.textContent = `Bundle generation failed safely: ${error.message}`;
  } finally {
    generate.disabled = !(latest?.valid && eula.checked);
  }
});

const commands = {
  docker: "sh scripts/install.sh --dry-run --target single-host --engine docker",
  podman: "sh scripts/install.sh --dry-run --target single-host --engine podman",
  kubernetes: "sh scripts/install.sh --dry-run --target kubernetes --manager direct",
  ansible: "sh scripts/install.sh --dry-run --target single-host --engine docker --manager ansible",
  argocd: "sh scripts/install.sh --dry-run --target kubernetes --manager argocd"
};
const commandTarget = document.querySelector("#command-target");
const bootstrapCommand = document.querySelector("#bootstrap-command");
commandTarget.addEventListener("change", () => { bootstrapCommand.textContent = commands[commandTarget.value]; });
document.querySelector("#copy-command").addEventListener("click", async () => {
  await navigator.clipboard.writeText(bootstrapCommand.textContent);
  document.querySelector("#copy-command").textContent = "Copied";
});

syncUi();
validateCurrent();
