import {
  calculateSizingWithRules,
  normalizeProfileWithRules,
  validateNormalizedProfile
} from "../src/core.mjs";
import { buildSingleHostBundle, requiredTemplatePaths } from "../src/bundle.mjs";
import { buildKubernetesBundle, requiredKubernetesTemplatePaths } from "../src/kubernetes.mjs";
import { createZip } from "./zip.mjs";

// Global variables for catalog data
let sizingRules, policies, compatibility, legal, sources;
let autoUpdatesTouched = false;
let validationTimer;

// DOM element references
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
const commandTarget = document.querySelector("#command-target");
const bootstrapCommand = document.querySelector("#bootstrap-command");

// Use MutationObserver as fallback for change detection
// This ensures syncUi() is called even if change event doesn't fire in some environments
if (runtime) {
  const observer = new MutationObserver(() => {
    syncUi();
    validateCurrent();
  });
  observer.observe(runtime, { 
    childList: true,
    subtree: true,
    attributes: true
  });
}

// Utility functions
const catalogUrl = (name) => new URL(`../catalog/${name}.json`, import.meta.url);

async function fetchJson(name) {
  const response = await fetch(catalogUrl(name));
  if (!response.ok) throw new Error(`Unable to load ${name} policy catalogue`);
  return response.json();
}

const field = (name) => form.elements.namedItem(name);
const value = (name) => String(field(name)?.value ?? "").trim();
const number = (name) => Number(value(name));
const checked = (name) => Boolean(field(name)?.checked);
const optionalNumber = (name) => value(name) === "" ? null : Number(value(name));

function randomSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function option(value, label) {
  const item = document.createElement("option");
  item.value = value;
  item.textContent = label;
  return item;
}

function q(str) {
  if (typeof str !== "string") return str;
  return JSON.stringify(str);
}

function syncUi() {
  const isKubernetes = runtime.value === "kubernetes";
  const isProduction = purpose.value === "production";
  const previousManager = manager.value;
  manager.replaceChildren(
    option(isKubernetes ? "helm" : "direct", isKubernetes ? "Helm" : "Direct"),
    option(isKubernetes ? "argocd" : "ansible", isKubernetes ? "Argo CD" : "Ansible")
  );
  if ([...manager.options].some((item) => item.value === previousManager)) {
    manager.value = previousManager;
  } else {
    // Set default manager value if previous value is not valid
    manager.value = isKubernetes ? "helm" : "direct";
  }
  document.querySelectorAll("[data-kubernetes]").forEach((item) => { item.hidden = !isKubernetes; });
  document.querySelectorAll("[data-single-host]").forEach((item) => { item.hidden = isKubernetes; });

  const productionOption = [...purpose.options].find((item) => item.value === "production");
  if (productionOption) {
    productionOption.disabled = isKubernetes || runtime.value === "podman";
    if (productionOption.disabled && purpose.value === "production") purpose.value = "evaluation";
  }
  document.querySelector("#maturity-note").textContent = isKubernetes
    ? "Community Preview: chart 0.7.0 and oCIS 7.1.4 stay pinned; issue #6 remains open."
    : runtime.value === "podman"
      ? "Podman is runnable Community Preview until its full parity matrix passes."
      : "Docker is the production-gated single-host path; production still depends on launch gates and load testing.";

  const users = Number(usersInput.value);
  const embeddedOption = [...identityMode.options].find((item) => item.value === "embedded");
  if (policies) {
    embeddedOption.disabled = users > policies.identity.embeddedMaximumUsers;
  }
  document.querySelector("#external-identity").hidden = identityMode.value !== "external-oidc";

  const s3 = value("storageMode") === "s3ng";
  document.querySelector("#s3-fields").hidden = !s3;
  const nfs = value("filesystem") === "nfs";
  document.querySelector("#storage-class-field").hidden = !(isKubernetes && nfs);

  const office = value("officeMode") === "collabora";
  document.querySelector("#office-deployment-field").hidden = !office;
  document.querySelector("#collabora-concurrency-field").hidden = !office;
  const officeDeploymentField = field("officeDeployment");
  if (isKubernetes && office && officeDeploymentField) officeDeploymentField.value = "external";
  if (officeDeploymentField) {
    const bundledOption = [...officeDeploymentField.options].find((item) => item.value === "bundled");
    if (bundledOption) bundledOption.disabled = isKubernetes;
  }
  const bundled = office && value("officeDeployment") === "bundled";
  document.querySelector("#collabora-domain-field").hidden = !bundled;
  document.querySelector("#collabora-password-field").hidden = !bundled;
  document.querySelector("#collabora-url-field").hidden = !(office && !bundled);

  const tlsFields = document.querySelector("#tls-fields");
  if (tlsFields) {
    tlsFields.hidden = !isProduction || value("tlsMode") !== "acme";
  }
  const autoUpdatesField = document.querySelector("#auto-updates-field");
  const autoUpdatesInput = document.querySelector("#auto-updates");
  if (autoUpdatesField) {
    autoUpdatesField.hidden = purpose.value === "production" || runtime.value === "kubernetes";
  }
  if (autoUpdatesInput) {
    autoUpdatesInput.disabled = purpose.value === "production" || runtime.value === "kubernetes" || runtime.value === "podman";
  }
  
  // For production, only ACME TLS mode is allowed
  const tlsModeSelect = document.querySelector("#tls-mode");
  if (tlsModeSelect && isProduction) {
    const options = [...tlsModeSelect.options];
    const evalOption = options.find(opt => opt.value === "evaluation-self-signed");
    if (evalOption) {
      evalOption.disabled = true;
    }
    // Force ACME if Evaluation Self-signed was selected
    if (tlsModeSelect.value === "evaluation-self-signed") {
      tlsModeSelect.value = "acme";
    }
  }

  if (isKubernetes) {
    const imageDigestNote = document.querySelector("#image-digest-note");
    const healthcheckNote = document.querySelector("#healthcheck-url-note");
    if (imageDigestNote) {
      imageDigestNote.textContent = `Pinned to oCIS ${sources?.ocisCharts?.appVersion || "7.1.4"}`;
      imageDigestNote.hidden = false;
    }
    if (healthcheckNote) {
      healthcheckNote.textContent = "Relative to Traefik service at https://ocis-traefik.";
      healthcheckNote.hidden = false;
    }
  } else {
    const imageDigestNote = document.querySelector("#image-digest-note");
    const healthcheckNote = document.querySelector("#healthcheck-url-note");
    if (imageDigestNote) {
      imageDigestNote.textContent = `Pinned to oCIS ${sources?.ocisCompose?.commit?.substring(0, 12) || "8.2.0"}`;
      imageDigestNote.hidden = false;
    }
    if (healthcheckNote) {
      healthcheckNote.textContent = "Relative to single-host service at https://ocis.";
      healthcheckNote.hidden = false;
    }
  }
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
      monitoring: checked("monitoring")
    },
    security: { basicAuth: purpose.value === "evaluation", demoUsers: false },
    updates: {
      automaticSecurityPatches: checked("autoUpdates"),
      observationDelayHours: number("updateDelay"),
      backupRecipient: value("backupRecipient")
    }
  };

  const collaboraConcurrency = optionalNumber("collaboraConcurrentUsers");
  if (value("officeMode") === "collabora") {
    if (isKubernetes) {
      profile.office = { mode: "collabora", deployment: "external", ...(value("officeDeployment") === "bundled" ? { bundled: true } : {}) };
    } else {
      const officeDeployment = value("officeDeployment");
      if (officeDeployment === "bundled") {
        profile.office = {
          mode: "collabora",
          deployment: "bundled",
          concurrency: collaboraConcurrency || 100,
          password: randomSecret()
        };
      } else if (officeDeployment === "external") {
        profile.office = {
          mode: "collabora",
          deployment: "external",
          url: value("officeUrl"),
          concurrency: collaboraConcurrency
        };
      }
    }
  }

  const mailHost = value("mailHost");
  const mailPort = value("mailPort");
  const mailUser = value("mailUser");
  const mailPassword = value("mailPassword");
  const mailSender = value("mailSender");

  if (mailHost) {
    profile.notifications = {
      mail: {
        host: mailHost,
        port: mailPort ? Number(mailPort) : undefined,
        user: mailUser,
        password: mailPassword,
        sender: mailSender
      }
    };
  }

  const backupPassword = value("backupPassword");
  const backupVolume = value("backupVolume");
  if (backupPassword && backupVolume) {
    profile.backup = {
      password: backupPassword,
      volume: backupVolume
    };
  }

  if (isKubernetes) {
    profile.storage = {
      ...profile.storage,
      storageClassName: value("storageClassName")
    };
    if (checked("tlsBringYourOwn")) {
      profile.networking = {
        ...profile.networking,
        tls: {
          mode: "bring-your-own",
          certificate: value("tlsCertificate"),
          key: value("tlsKey")
        }
      };
    } else if (value("tlsMode") === "acme") {
      profile.networking.tls = {
        mode: "acme",
        issuer: value("tlsIssuer"),
        email: value("tlsEmail")
      };
    }
  } else {
    const mailConfig = value("mailConfig");
    if (mailConfig) {
      profile.mail = { host: mailConfig };
    }
  }

  return profile;
}

function validateCurrent({ reveal } = {}) {
  let profile;
  try {
    profile = profileFromForm();
    if (sizingRules && policies && compatibility) {
      profile = normalizeProfileWithRules(profile, sizingRules, policies, compatibility);
    }
  } catch (e) {
    return { valid: false, profile, errors: [String(e)] };
  }

  let result;
  if (policies && compatibility) {
    result = validateNormalizedProfile(profile, policies, compatibility);
  } else {
    result = { valid: true, profile, errors: [] };
  }
  result.profile = profile;

  if (reveal.report) {
    if (result.errors?.length > 0) {
      errorsBox.textContent = result.errors.join("\n");
      errorsBox.hidden = false;
    } else {
      errorsBox.hidden = true;
    }

    const identityMax = policies?.identity?.embeddedMaximumUsers;
    if (identityMax && profile.identity.mode === "embedded") {
      if (profile.workload.registeredUsers > identityMax) {
        errorsBox.textContent += `\nEmbedded identity limited to ${identityMax} users`;
        errorsBox.hidden = false;
      }
    }

    if (sizingRules) {
      const sizing = calculateSizingWithRules(profile, sizingRules);
      const progress = document.querySelector("#sizing-progress");
      const calculation = document.querySelector("#sizing-calculation");
      const minimal = document.querySelector("#sizing-minimal");
      const recommended = document.querySelector("#sizing-recommended");
      const breakdownList = document.querySelector("#sizing-breakdown");

      if (progress) progress.hidden = false;
      if (calculation) calculation.hidden = false;
      if (minimal) minimal.hidden = false;
      if (recommended) recommended.hidden = false;

      breakdownList.replaceChildren(
        ...Object.entries(sizing).map(([key, value]) => {
          const item = document.createElement("li");
          item.textContent = `${key}: ${value}`;
          return item;
        })
      );

      const breakdownEntries = Object.entries(sizing);
      const total = breakdownEntries.reduce((sum, [, v]) => sum + (v || 0), 0);
      const minimalTotal = Math.ceil(total);
      const recommendedTotal = Math.ceil(total * 1.3);

      // Add calculated minimum and recommended to breakdown for backward compatibility
      if (breakdownList) {
        const minItem = document.createElement("li");
        minItem.textContent = `Calculated minimum: ${minimalTotal} GB`;
        breakdownList.appendChild(minItem);
        const recItem = document.createElement("li");
        recItem.textContent = `Recommended: ${recommendedTotal} GB`;
        breakdownList.appendChild(recItem);
      }

      if (minimal) minimal.textContent = `Calculated minimum: ${minimalTotal} GB`;
      if (recommended) recommended.textContent = `Recommended: ${recommendedTotal} GB`;
    }
  }

  return result;
}

async function loadTemplates(profile) {
  const paths = profile.target.runtime === "kubernetes"
    ? requiredKubernetesTemplatePaths()
    : requiredTemplatePaths(profile);
  const entries = await Promise.all(paths.map(async (path) => {
    const response = await fetch(new URL(path, import.meta.url));
    if (!response.ok) throw new Error(`Unable to load template ${path}`);
    const data = await response.text();
    const templateName = path.split("/").pop().replace(".yml", "");
    return { templateName, data };
  }));

  return Object.fromEntries(entries.map(({ templateName, data }) => [templateName, data]));
}

async function generateBundle(event) {
  if (event) event.preventDefault();
  
  if (!checked("eula")) {
    errorsBox.textContent = "Please accept the End User License Agreement";
    errorsBox.hidden = false;
    return;
  }

  const result = validateCurrent({ reveal: true });
  if (!result.valid || !form.reportValidity()) {
    errorsBox.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  status.hidden = false;
  status.textContent = "Building your profile ...";

  try {
    const profile = result.profile;
    const templates = await loadTemplates(profile);

    if (profile.target.runtime === "kubernetes") {
      const bundle = await buildKubernetesBundle(profile, templates);
      const zip = await createZip(profile, bundle, templates);
      const blob = new Blob([zip], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `get-owncloud-${profile.target.runtime}-${profile.ocisVersion}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const bundle = await buildSingleHostBundle(profile, templates);
      const zip = await createZip(profile, bundle, templates);
      const blob = new Blob([zip], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `get-owncloud-${profile.target.runtime}-${profile.ocisVersion}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    }
  } catch (e) {
    status.textContent = `Error: ${String(e)}`;
    setTimeout(() => { status.hidden = true; }, 5000);
  }
}

async function loadProfile(event) {
  if (event) event.preventDefault();
  
  const fileInput = document.querySelector("#load-profile-input");
  const file = fileInput.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const profile = JSON.parse(text);
    
    // Populate form fields from profile
    if (profile.purpose) purpose.value = profile.purpose;
    if (profile.target?.runtime) runtime.value = profile.target.runtime;
    if (profile.target?.manager) manager.value = profile.target.manager;
    if (profile.workload?.registeredUsers !== undefined) usersInput.value = profile.workload.registeredUsers;
    if (profile.workload?.storedDataGiB !== undefined) {
      const storedDataGibEl = document.querySelector("#stored-data-gib");
      if (storedDataGibEl) storedDataGibEl.value = profile.workload.storedDataGiB;
    }
    if (profile.workload?.annualGrowthPercent !== undefined) {
      const annualGrowthPercentEl = document.querySelector("#annual-growth-percent");
      if (annualGrowthPercentEl) annualGrowthPercentEl.value = profile.workload.annualGrowthPercent;
    }
    if (profile.identity?.mode) identityMode.value = profile.identity.mode;
    if (profile.storage?.mode) {
      const storageModeEl = document.querySelector("#storage-mode");
      if (storageModeEl) storageModeEl.value = profile.storage.mode;
    }
    if (profile.storage?.filesystem) document.querySelector("#filesystem").value = profile.storage.filesystem;
    if (profile.storage?.dataPath) document.querySelector("#dataPath").value = profile.storage.dataPath;
    if (profile.storage?.configPath) document.querySelector("#configPath").value = profile.storage.configPath;
    if (profile.office?.mode) {
      const officeModeEl = document.querySelector("#office-mode");
      if (officeModeEl) officeModeEl.value = profile.office.mode;
    }
    if (profile.networking?.domain) document.querySelector("#domain").value = profile.networking.domain;
    if (profile.networking?.httpPort !== undefined) document.querySelector("#httpPort").value = profile.networking.httpPort;
    if (profile.networking?.httpsPort !== undefined) document.querySelector("#httpsPort").value = profile.networking.httpsPort;
    if (profile.networking?.tls?.mode) {
      const tlsModeEl = document.querySelector("#tls-mode");
      if (tlsModeEl) tlsModeEl.value = profile.networking.tls.mode;
    }
    
    // Trigger UI sync
    syncUi();
    validateCurrent();
    
    fileInput.value = "";
  } catch (e) {
    errorsBox.textContent = `Error loading profile: ${String(e)}`;
    errorsBox.hidden = false;
  }
}

// Set up event listeners BEFORE loading catalogs
runtime.addEventListener("change", () => {
  console.log("Change event fired on runtime, value:", runtime.value);
  syncUi();
  validateCurrent();
});
runtime.addEventListener("input", () => {
  console.log("Input event fired on runtime, value:", runtime.value);
  syncUi();
  validateCurrent();
});
autoUpdates.addEventListener("change", () => { autoUpdatesTouched = true; });
usersInput.addEventListener("input", () => {
  const users = Number(usersInput.value);
  const embeddedOption = [...identityMode.options].find((item) => item.value === "embedded");
  if (embeddedOption && users > (policies?.identity?.embeddedMaximumUsers || 20) && identityMode.value === "embedded") {
    identityMode.value = "external-oidc";
    syncUi();
  }
});

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
document.querySelector("#download-profile").addEventListener("click", () => {
  const profile = profileFromForm();
  const blob = new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "profile.json";
  a.click();
  URL.revokeObjectURL(url);
});
generate.addEventListener("click", (event) => generateBundle(event));
document.querySelector("#load-profile").addEventListener("click", () => document.querySelector("#load-profile-input").click());
document.querySelector("#load-profile-input").addEventListener("change", loadProfile);

const commands = {
  docker: "sh scripts/install.sh --dry-run --target single-host --engine docker",
  podman: "sh scripts/install.sh --dry-run --target single-host --engine podman",
  kubernetes: "sh scripts/install.sh --dry-run --target kubernetes --manager helm",
  ansible: "sh scripts/install.sh --dry-run --target single-host --engine docker --manager ansible",
  argocd: "sh scripts/install.sh --dry-run --target kubernetes --manager argocd"
};
commandTarget.addEventListener("change", () => { bootstrapCommand.textContent = commands[commandTarget.value]; });
document.querySelector("#copy-command").addEventListener("click", async () => {
  await navigator.clipboard.writeText(bootstrapCommand.textContent);
  document.querySelector("#copy-command").textContent = "Copied";
});

// Load catalogs asynchronously and initialize UI
async function loadCatalogs() {
  try {
    [sizingRules, policies, compatibility, legal, sources] = await Promise.all([
      fetchJson("sizing"),
      fetchJson("policies"),
      fetchJson("compatibility"),
      fetchJson("legal"),
      fetchJson("sources.lock")
    ]);
  } catch (e) {
    console.error("Error loading catalogs:", e);
    // Initialize UI with default/empty values
  } finally {
    // Always initialize UI after attempting to load catalogs
    syncUi();
    validateCurrent();
  }
}

// Load catalogs and initialize UI
loadCatalogs();
