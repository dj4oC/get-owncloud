const ROOT = new URL("../", import.meta.url);
const ROOT_KEYS = new Set([
  "apiVersion", "purpose", "maturity", "ocisVersion", "target", "workload", "identity",
  "storage", "office", "networking", "mail", "features", "security", "updates", "system",
  "aiProxy", "demoContent"
]);
const OBJECT_KEYS = {
  target: new Set(["runtime", "manager"]),
  workload: new Set([
    "registeredUsers", "storedDataGiB", "annualGrowthPercent", "peakConcurrentUsers",
    "collaboraConcurrentUsers", "expectedSpaces", "maximumPreviewMiB", "highAvailability",
    "headroomPercent"
  ]),
  identity: new Set([
    "mode", "issuer", "clientId", "userClaim", "cs3Claim", "ldapUri", "ldapBindDn",
    "ldapSecretRef", "ldapUserBaseDn", "ldapGroupBaseDn", "ldapUserIdAttribute",
    "ldapUserNameAttribute", "ldapGroupIdAttribute", "ldapGroupNameAttribute"
  ]),
  storage: new Set(["mode", "filesystem", "dataPath", "configPath", "nfsVersion", "storageClassName", "s3"]),
  s3: new Set(["endpoint", "region", "bucket", "accessKeyReference", "secretKeyReference"]),
  office: new Set(["mode", "deployment", "url"]),
  networking: new Set(["domain", "collaboraDomain", "httpPort", "httpsPort", "ingressClassName", "tlsSecretName", "tls"]),
  tls: new Set(["mode", "email", "caServer"]),
  mail: new Set(["host", "port", "sender", "senderDisplayName", "username", "authentication", "passwordSecretRef", "transportSecurity", "caTrust", "caSecretRef", "insecure"]),
  features: new Set([
    "clamav", "search", "tika", "drawio", "externalSites", "jsonViewer", "photoAddon", "unzip",
    "notifications", "monitoring", "aiDataInsightsSidebar", "aiDocSummary", "aiFolderBriefSidebar",
    "aiFolderReadmeGenerator", "aiImageAltTextSidebar", "aiLlmProxy", "aiMultiDocSynthesizer",
    "aiQuickDraftCreator", "aiSensitiveDataScanner", "aiSmartCollectionsNav", "aiSmartFileTaggerQa",
    "chatWithFile", "versionChangelog", "fileComments", "groupManagement", "ocisAppTokens", "vimNav"
  ]),
  aiProxy: new Set([
    "enabled", "endpoint", "apiKeySecretRef", "defaultTextModel", "visionModel", "forcedModel",
    "requestTimeout", "tls", "outboundProxy", "networkPolicy", "maxInputSize", "maxOutputSize", "maxConcurrency"
  ]),
  aiProxyTls: new Set(["enabled", "customCA", "caSecretRef"]),
  demoContent: new Set(["enabled", "optInRequired", "destructiveWarning", "licenses", "sampleFiles", "resetPath"]),
  demoContentSampleFile: new Set(["name", "path", "license", "origin", "size"]),
  monitoring: new Set(["enabled", "metrics", "opentelemetry"]),
  metrics: new Set(["enabled", "endpoint", "authentication"]),
  opentelemetry: new Set(["enabled", "endpoint", "protocol", "tls", "caSecretRef"]),
  security: new Set(["basicAuth", "demoUsers"]),
  updates: new Set(["automaticSecurityPatches", "observationDelayHours", "backupRecipient"]),
  system: new Set(["cpu", "ramMiB", "diskGiB"])
};

export async function loadCatalog(name) {
  const { readFile } = await import("node:fs/promises");
  return JSON.parse(await readFile(new URL(`catalog/${name}.json`, ROOT), "utf8"));
}

function integerDefault(value, fallback) {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function numberDefault(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function knownKeys(errors, value, allowed, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`Unknown field: ${path}.${key}`);
  }
}

function isHttpsUrl(value) {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

function isProductionDomain(value) {
  if (typeof value !== "string" || !value.includes(".")) return false;
  const lower = value.toLowerCase();
  return !["localhost", "owncloud.test", "example", "example.org", "example.com", "example.net", "invalid", "test"].some((suffix) =>
    lower === suffix || lower.endsWith(`.${suffix}`)
  ) && !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(lower);
}

function isSafeStoragePath(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  // CWE-22 path traversal prevention: reject paths containing traversal sequences
  // Absolute paths are allowed (e.g., /srv/owncloud/data) as they are explicit and safe
  const normalized = value.replaceAll("\\", "/").replace(/\/+$/, "") || "/";
  if (["/", ".", ".."].includes(normalized)) return false;
  return !normalized.split("/").includes("..");
}

function normalizedStoragePath(value) {
  const text = String(value).replaceAll("\\", "/");
  const absolute = text.startsWith("/");
  const parts = text.split("/").filter((part) => part && part !== ".");
  return `${absolute ? "/" : ""}${parts.join("/")}` || (absolute ? "/" : ".");
}

function flattenValues(value, output = []) {
  if (Array.isArray(value)) {
    for (const item of value) flattenValues(item, output);
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      output.push(key);
      flattenValues(item, output);
    }
  } else if (typeof value === "string") {
    output.push(value);
  }
  return output;
}



import { deepClone } from "./clone.mjs";

export function normalizeProfileWithRules(input, sizing) {
  const profile = deepClone(input);
  profile.ocisVersion ??= profile.target?.runtime === "kubernetes" ? "7.1.4" : "8.2.0";
  profile.maturity ??= profile.purpose === "production" ? "production" : "community-preview";
  profile.workload ??= {};
  const users = profile.workload.registeredUsers ?? 0;
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
  profile.workload.annualGrowthPercent = numberDefault(
    profile.workload.annualGrowthPercent,
    sizing.defaults.annualGrowthPercent
  );
  profile.workload.headroomPercent = integerDefault(
    profile.workload.headroomPercent,
    sizing.defaults.headroomPercent
  );
  profile.features = {
    clamav: false,
    search: true,
    tika: false,
    drawio: false,
    externalSites: [],
    jsonViewer: false,
    photoAddon: false,
    unzip: false,
    notifications: false,
    monitoring: false,
    aiDataInsightsSidebar: false,
    aiDocSummary: false,
    aiFolderBriefSidebar: false,
    aiFolderReadmeGenerator: false,
    aiImageAltTextSidebar: false,
    aiLlmProxy: false,
    aiMultiDocSynthesizer: false,
    aiQuickDraftCreator: false,
    aiSensitiveDataScanner: false,
    aiSmartCollectionsNav: false,
    aiSmartFileTaggerQa: false,
    chatWithFile: false,
    versionChangelog: false,
    fileComments: false,
    groupManagement: false,
    ocisAppTokens: false,
    vimNav: false,
    ...profile.features
  };
  
  // Handle monitoring configuration - can be boolean or object
  if (profile.features?.monitoring === undefined || profile.features?.monitoring === null) {
    profile.features.monitoring = false;
  } else if (profile.features?.monitoring === true) {
    profile.features.monitoring = { enabled: true, metrics: { enabled: true }, opentelemetry: { enabled: false } };
  } else if (profile.features?.monitoring === false) {
    profile.features.monitoring = false;
  } else if (typeof profile.features?.monitoring === 'object') {
    // Ensure proper defaults for monitoring object
    profile.features.monitoring = {
      enabled: profile.features.monitoring.enabled ?? true,
      metrics: {
        enabled: profile.features.monitoring.metrics?.enabled ?? true,
        endpoint: profile.features.monitoring.metrics?.endpoint ?? '',
        authentication: profile.features.monitoring.metrics?.authentication ?? false
      },
      opentelemetry: {
        enabled: profile.features.monitoring.opentelemetry?.enabled ?? false,
        endpoint: profile.features.monitoring.opentelemetry?.endpoint ?? '',
        protocol: profile.features.monitoring.opentelemetry?.protocol ?? 'grpc',
        tls: profile.features.monitoring.opentelemetry?.tls ?? true,
        caSecretRef: profile.features.monitoring.opentelemetry?.caSecretRef ?? ''
      }
    };
  }
  
  // Handle AI proxy configuration - can be boolean or object
  if (profile.aiProxy === undefined || profile.aiProxy === null) {
    profile.aiProxy = false;
  } else if (profile.aiProxy === true) {
    profile.aiProxy = {
      enabled: true,
      endpoint: '',
      apiKeySecretRef: '',
      defaultTextModel: 'gpt-4',
      visionModel: '',
      forcedModel: '',
      requestTimeout: 30,
      tls: { enabled: true, customCA: false, caSecretRef: '' },
      outboundProxy: '',
      networkPolicy: '',
      maxInputSize: 1048576,  // 1MB
      maxOutputSize: 1048576, // 1MB
      maxConcurrency: 10
    };
  } else if (profile.aiProxy === false) {
    profile.aiProxy = false;
  } else if (typeof profile.aiProxy === 'object') {
    profile.aiProxy = {
      enabled: profile.aiProxy.enabled ?? true,
      endpoint: profile.aiProxy.endpoint ?? '',
      apiKeySecretRef: profile.aiProxy.apiKeySecretRef ?? '',
      defaultTextModel: profile.aiProxy.defaultTextModel ?? 'gpt-4',
      visionModel: profile.aiProxy.visionModel ?? '',
      forcedModel: profile.aiProxy.forcedModel ?? '',
      requestTimeout: profile.aiProxy.requestTimeout ?? 30,
      tls: {
        enabled: profile.aiProxy.tls?.enabled ?? true,
        customCA: profile.aiProxy.tls?.customCA ?? false,
        caSecretRef: profile.aiProxy.tls?.caSecretRef ?? ''
      },
      outboundProxy: profile.aiProxy.outboundProxy ?? '',
      networkPolicy: profile.aiProxy.networkPolicy ?? '',
      maxInputSize: profile.aiProxy.maxInputSize ?? 1048576,
      maxOutputSize: profile.aiProxy.maxOutputSize ?? 1048576,
      maxConcurrency: profile.aiProxy.maxConcurrency ?? 10
    };
  }
  
  // Handle demoContent configuration
  if (profile.demoContent === undefined || profile.demoContent === null) {
    profile.demoContent = { enabled: false };
  } else if (typeof profile.demoContent === 'object') {
    profile.demoContent = {
      enabled: profile.demoContent.enabled ?? false,
      optInRequired: profile.demoContent.optInRequired ?? true,
      destructiveWarning: profile.demoContent.destructiveWarning ?? true,
      licenses: profile.demoContent.licenses ?? [],
      sampleFiles: profile.demoContent.sampleFiles ?? [],
      resetPath: profile.demoContent.resetPath ?? ''
    };
  }
  
  profile.security = { basicAuth: false, demoUsers: false, ...profile.security };
  if (profile.identity?.mode === "external-oidc") {
    profile.identity.userClaim ??= "preferred_username";
    profile.identity.cs3Claim ??= "username";
    profile.identity.ldapUserIdAttribute ??= "ownclouduuid";
    profile.identity.ldapUserNameAttribute ??= "uid";
    profile.identity.ldapGroupIdAttribute ??= "ownclouduuid";
    profile.identity.ldapGroupNameAttribute ??= "cn";
  }
  profile.updates = {
    automaticSecurityPatches: profile.purpose === "production" && profile.target?.runtime === "docker",
    observationDelayHours: 24,
    ...profile.updates
  };
  profile.networking ??= {};
  if (profile.purpose === "evaluation") {
    profile.networking.domain ??= "ocis.owncloud.test";
    profile.networking.tls ??= { mode: "evaluation-self-signed" };
    if (profile.office?.mode === "collabora" && profile.office?.deployment === "bundled") {
      profile.networking.collaboraDomain ??= "collabora.owncloud.test";
    }
  }
  profile.networking.httpPort ??= profile.purpose === "production" ? 80 : 8080;
  profile.networking.httpsPort ??= profile.purpose === "production" ? 443 : 8443;
  profile.storage ??= {};
  profile.storage.dataPath ??= "./data/data";
  profile.storage.configPath ??= "./data/config";
  return profile;
}

export async function normalizeProfile(input) {
  return normalizeProfileWithRules(input, await loadCatalog("sizing"));
}

export function validateNormalizedProfile(profile, policies, compatibility) {
  const errors = [];

  knownKeys(errors, profile, ROOT_KEYS, "profile");
  for (const key of ["target", "workload", "identity", "storage", "office", "networking", "mail", "features", "security", "updates", "system", "aiProxy", "demoContent"]) {
    if (profile[key]) knownKeys(errors, profile[key], OBJECT_KEYS[key], key);
  }
  if (profile.storage?.s3) knownKeys(errors, profile.storage.s3, OBJECT_KEYS.s3, "storage.s3");
  if (profile.networking?.tls) knownKeys(errors, profile.networking.tls, OBJECT_KEYS.tls, "networking.tls");
  if (profile.aiProxy?.tls) knownKeys(errors, profile.aiProxy.tls, OBJECT_KEYS.aiProxyTls, "aiProxy.tls");
  if (profile.demoContent?.sampleFiles) {
    for (const file of profile.demoContent.sampleFiles) {
      knownKeys(errors, file, OBJECT_KEYS.demoContentSampleFile, "demoContent.sampleFiles[]");
    }
  }

  if (profile.apiVersion !== "get.owncloud.com/v1alpha1") errors.push("Unsupported apiVersion");
  if (!["evaluation", "production"].includes(profile.purpose)) errors.push("Purpose must be evaluation or production");
  if (!["community-preview", "production"].includes(profile.maturity)) errors.push("Experimental or unknown maturity is never deployable");

  const runtime = profile.target?.runtime;
  const manager = profile.target?.manager;
  if (!["docker", "podman", "kubernetes"].includes(runtime)) errors.push("Unsupported runtime");
  if (!["direct", "ansible", "argocd"].includes(manager)) errors.push("Unsupported manager");
  if (manager === "ansible" && !["docker", "podman"].includes(runtime)) errors.push("Ansible wraps the single-host family");
  if (manager === "argocd" && runtime !== "kubernetes") errors.push("Argo CD wraps the Kubernetes/Helm family");
  if (runtime === "kubernetes" && profile.ocisVersion !== compatibility.helm.targetOcisVersion) {
    errors.push(`Kubernetes Community Preview is held at oCIS ${compatibility.helm.targetOcisVersion}`);
  }
  if (runtime !== "kubernetes" && profile.ocisVersion !== compatibility.ocis.version) {
    errors.push(`Single-host output is pinned to oCIS ${compatibility.ocis.version}`);
  }
  if (profile.purpose === "production" && runtime === "kubernetes") {
    errors.push("Kubernetes 7.1.4 remains Community Preview under open issue #6");
  }
  if (profile.purpose === "production" && runtime === "podman") {
    errors.push("Podman remains Community Preview until its runtime promotion matrix passes");
  }

  const users = profile.workload?.registeredUsers;
  if (!Number.isInteger(users) || users < 1) errors.push("registeredUsers must be a positive integer");
  if (!Number.isFinite(profile.workload?.storedDataGiB) || profile.workload.storedDataGiB < 0) {
    errors.push("storedDataGiB must be a non-negative number");
  }
  if (profile.identity?.mode === "embedded" && users > policies.identity.embeddedMaximumUsers) {
    errors.push(`Embedded IDP/IDM is limited to ${policies.identity.embeddedMaximumUsers} users`);
  }
  if (!["embedded", "external-oidc"].includes(profile.identity?.mode)) errors.push("Identity must be embedded or external OIDC");
  if (profile.identity?.mode === "external-oidc") {
    if (!isHttpsUrl(profile.identity.issuer)) errors.push("External OIDC issuer must be an HTTPS URL");
    if (!profile.identity.clientId) errors.push("External OIDC clientId is required");
    if (typeof profile.identity.ldapUri !== "string" || !profile.identity.ldapUri.startsWith("ldaps://")) {
      errors.push("External identity requires a trusted LDAPS directory URI");
    }
    for (const field of ["ldapBindDn", "ldapUserBaseDn", "ldapGroupBaseDn"]) {
      if (!profile.identity[field]) errors.push(`External identity requires ${field}`);
    }
    if (runtime === "kubernetes" && !profile.identity.ldapSecretRef) {
      errors.push("Kubernetes external identity requires ldapSecretRef");
    }
  }

  const office = String(profile.office?.mode ?? "").toLowerCase();
  if (!policies.office.allowed.includes(office)) errors.push("Only no office integration or Collabora is allowed");
  if (office === "collabora" && !["bundled", "external"].includes(profile.office?.deployment)) {
    errors.push("Collabora deployment must be bundled or external");
  }
  if (office === "collabora" && profile.office?.deployment === "external" && !isHttpsUrl(profile.office?.url)) {
    errors.push("External Collabora must use an HTTPS URL");
  }

  const storage = String(profile.storage?.mode ?? "").toLowerCase();
  if (policies.storage.denied.includes(storage) || !policies.storage.allowedModes.includes(storage)) {
    errors.push(`Storage driver ${storage || "<missing>"} is denied; use standard ocis or s3ng`);
  }
  if (!policies.storage.allowedPosixFilesystems.includes(profile.storage?.filesystem)) {
    errors.push("Storage metadata must use an allowed POSIX filesystem");
  }
  if (profile.storage?.filesystem === "nfs" && profile.storage?.nfsVersion !== policies.storage.requiredNfsVersion) {
    errors.push(`NFS must be ${policies.storage.requiredNfsVersion}`);
  }
  if (!isSafeStoragePath(profile.storage?.dataPath)) errors.push("A safe persistent dataPath is required");
  if (!isSafeStoragePath(profile.storage?.configPath)) errors.push("A safe persistent configPath is required");
  const normalizedDataPath = normalizedStoragePath(profile.storage?.dataPath);
  const normalizedConfigPath = normalizedStoragePath(profile.storage?.configPath);
  if (normalizedDataPath === normalizedConfigPath) errors.push("Storage dataPath and configPath must be distinct");
  if (normalizedDataPath.startsWith(`${normalizedConfigPath}/`) || normalizedConfigPath.startsWith(`${normalizedDataPath}/`)) {
    errors.push("Storage dataPath and configPath must not be nested");
  }
  if (storage === "s3ng") {
    const s3 = profile.storage?.s3;
    if (!s3 || !isHttpsUrl(s3.endpoint)) errors.push("s3ng requires an HTTPS endpoint");
    for (const field of ["region", "bucket", "accessKeyReference", "secretKeyReference"]) {
      if (!s3?.[field]) errors.push(`s3ng requires ${field}`);
    }
  }

  const domain = profile.networking?.domain;
  if (!domain) errors.push("Deployment domain is required");
  if (!["acme", "evaluation-self-signed"].includes(profile.networking?.tls?.mode)) errors.push("Unsupported TLS mode");
  if (runtime !== "kubernetes" && [profile.networking.httpPort, profile.networking.httpsPort].includes(8082)) {
    errors.push("Port 8082 is reserved for the internal Traefik health endpoint");
  }
  if (profile.purpose === "production") {
    if (!isProductionDomain(domain)) errors.push("Production requires a real FQDN");
    if (profile.networking?.tls?.mode !== "acme") errors.push("Production requires trusted ACME TLS in the current single-host release");
    if (!profile.networking?.tls?.email?.includes("@")) errors.push("ACME contact email is required");
    if (profile.networking.httpPort !== 80 || profile.networking.httpsPort !== 443) {
      errors.push("Production ACME requires public HTTP port 80 and HTTPS port 443");
    }
    if (profile.networking?.tls?.caServer && !isHttpsUrl(profile.networking.tls.caServer)) {
      errors.push("Production ACME directory must use HTTPS");
    }
    if (profile.security.basicAuth) errors.push("Basic authentication is evaluation-only");
    if (profile.security.demoUsers) errors.push("Demo users are forbidden in production");
  }
  if (profile.features.notifications && !profile.mail?.sender) {
    errors.push("SMTP sender is required when notifications are enabled");
  }
  
  // Validate monitoring configuration
  const monitoringConfig = profile.features.monitoring;
  if (monitoringConfig) {
    if (typeof monitoringConfig === 'object') {
      if (monitoringConfig.metrics?.endpoint && !isHttpsUrl(monitoringConfig.metrics.endpoint)) {
        errors.push("Metrics endpoint must use HTTPS");
      }
      if (monitoringConfig.opentelemetry?.endpoint && !isHttpsUrl(monitoringConfig.opentelemetry.endpoint)) {
        errors.push("OpenTelemetry endpoint must use HTTPS");
      }
      if (runtime === "kubernetes" && monitoringConfig.opentelemetry?.caSecretRef && 
          typeof monitoringConfig.opentelemetry.caSecretRef !== "string") {
        errors.push("OpenTelemetry CA secret reference must be a string for Kubernetes");
      }
    }
  }
  if (profile.updates?.automaticSecurityPatches) {
    const recipient = profile.updates.backupRecipient;
    if (typeof recipient !== "string" || !(recipient.startsWith("age1") || recipient.startsWith("ssh-ed25519 "))) {
      errors.push("Automatic security updates require an operator-controlled age or SSH Ed25519 backup recipient");
    }
    if (!Number.isInteger(profile.updates.observationDelayHours) || profile.updates.observationDelayHours < 24) {
      errors.push("Automatic security updates require an observation delay of at least 24 hours");
    }
  }
  if (office === "collabora" && profile.office.deployment === "bundled" && !profile.networking.collaboraDomain) {
    errors.push("Bundled Collabora requires a dedicated domain");
  }
  if (runtime === "kubernetes") {
    if (!profile.networking.ingressClassName) errors.push("Kubernetes requires ingressClassName");
    if (!profile.networking.tlsSecretName) errors.push("Kubernetes requires a pre-created tlsSecretName");
    if (profile.storage.filesystem === "nfs" && !profile.storage.storageClassName) {
      errors.push("Kubernetes NFS requires an explicitly reviewed NFSv4.2 StorageClass");
    }
    if (office === "collabora" && profile.office.deployment === "bundled") {
      errors.push("Kubernetes 7.1.4 preview supports external Collabora only; the oCIS chart does not bundle the Collabora server");
    }
    // Note: ClamAV validation updated - now supported across all deployment outputs
    if (profile.features.clamav) {
      const clamav = profile.features.clamav;
      if (typeof clamav === 'object' && runtime === "kubernetes") {
        if (!clamav.storageClassName) {
          errors.push("Kubernetes ClamAV requires storageClassName");
        }
      }
    }
    
    // AI Proxy validation
    if (profile.aiProxy) {
      const aiProxy = profile.aiProxy;
      if (typeof aiProxy === 'object') {
        if (aiProxy.enabled && !aiProxy.endpoint) {
          errors.push("AI Proxy requires endpoint when enabled");
        }
        if (aiProxy.endpoint && !aiProxy.endpoint.startsWith('https://')) {
          errors.push("AI Proxy endpoint must use HTTPS");
        }
        if (aiProxy.enabled && runtime === "kubernetes" && !aiProxy.apiKeySecretRef) {
          errors.push("Kubernetes AI Proxy requires apiKeySecretRef when enabled");
        }
        if (aiProxy.tls?.customCA && !aiProxy.tls?.caSecretRef) {
          errors.push("Custom CA requires caSecretRef");
        }
      }
    }
    
    // Demo Content validation
    if (profile.demoContent?.enabled) {
      if (profile.demoContent.optInRequired !== false && runtime === "production") {
        errors.push("Demo content opt-in is required for evaluation, prohibited for production");
      }
      if (profile.demoContent.destructiveWarning !== true) {
        errors.push("Demo content must have destructive warning enabled");
      }
      if (profile.demoContent.sampleFiles) {
        for (const file of profile.demoContent.sampleFiles) {
          if (!file.name || !file.path) {
            errors.push("Demo content sample files must have name and path");
            break;
          }
        }
      }
    }
    
    // AI Application dependency validation
    const aiApps = [
      'aiDataInsightsSidebar', 'aiDocSummary', 'aiFolderBriefSidebar', 'aiFolderReadmeGenerator',
      'aiImageAltTextSidebar', 'aiLlmProxy', 'aiMultiDocSynthesizer', 'aiQuickDraftCreator',
      'aiSensitiveDataScanner', 'aiSmartCollectionsNav', 'aiSmartFileTaggerQa', 'chatWithFile',
      'versionChangelog'
    ];
    const enabledAiApps = aiApps.filter(app => profile.features?.[app]);
    if (enabledAiApps.length > 0 && !profile.aiProxy?.enabled) {
      errors.push("AI applications require aiProxy to be enabled");
    }
    if (profile.features?.aiImageAltTextSidebar && !profile.aiProxy?.visionModel) {
      errors.push("Image Alt Text requires vision-capable model in AI Proxy");
    }
  }

  const deniedTokens = [...policies.storage.denied, "onlyoffice"];
  const deniedTokensSet = new Set(deniedTokens);
  
  // Use optimized search to find denied tokens without building large intermediate arrays
  const foundDeniedTokens = new Set();
  
  function collectDeniedTokens(value) {
    if (typeof value === "string") {
      const lower = value.toLowerCase();
      for (const denied of deniedTokensSet) {
        if (lower === denied || lower.includes(`/${denied}`) || lower.includes(`${denied}:`)) {
          foundDeniedTokens.add(denied);
          return true; // Short-circuit: stop searching this branch
        }
      }
      return false;
    }
    
    if (Array.isArray(value)) {
      for (const item of value) {
        if (collectDeniedTokens(item)) return true;
      }
      return false;
    }
    
    if (value && typeof value === "object") {
      // Check keys
      for (const key of Object.keys(value)) {
        if (collectDeniedTokens(key)) return true;
      }
      // Check values
      for (const item of Object.values(value)) {
        if (collectDeniedTokens(item)) return true;
      }
      return false;
    }
    
    return false;
  }
  
  collectDeniedTokens(profile);
  
  for (const denied of foundDeniedTokens) {
    errors.push(`Denied value found: ${denied}`);
  }

  return { valid: errors.length === 0, errors: [...new Set(errors)], profile };
}

export async function validateProfile(raw) {
  const [sizing, policies, compatibility] = await Promise.all([
    loadCatalog("sizing"), loadCatalog("policies"), loadCatalog("compatibility")
  ]);
  const profile = normalizeProfileWithRules(raw, sizing);
  return validateNormalizedProfile(profile, policies, compatibility);
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

export function calculateSizingWithRules(profile, rules) {
  const contributions = [{ component: "oCIS base", cpu: rules.base.cpu, ramMiB: rules.base.ramMiB, diskGiB: rules.base.diskGiB }];
  let cpu = rules.base.cpu;
  let ramMiB = rules.base.ramMiB;
  let serviceDiskGiB = rules.base.diskGiB;
  let networkKbit = 0;

  const cacheRam = Math.ceil(profile.workload.expectedSpaces * rules.spaceCache.kiBPerSpace / 1024);
  ramMiB += cacheRam;
  contributions.push({ component: "Space root/stat cache", cpu: 0, ramMiB: cacheRam, diskGiB: 0 });

  if (profile.features.search) {
    const searchDisk = Math.min(
      rules.search.maximumDiskGiB,
      Math.ceil(profile.workload.storedDataGiB * rules.search.diskPercentOfStoredData / 100)
    );
    cpu += rules.search.cpu;
    ramMiB += rules.search.ramMiB;
    serviceDiskGiB += searchDisk;
    contributions.push({ component: "Search and extraction", cpu: rules.search.cpu, ramMiB: rules.search.ramMiB, diskGiB: searchDisk });
  }
  if (profile.office?.mode === "collabora" && profile.office?.deployment === "bundled") {
    const concurrent = profile.workload.collaboraConcurrentUsers;
    const officeCpu = Math.max(rules.collabora.minimumCpu, Math.ceil(concurrent / rules.collabora.usersPerCpuThreadCrossCheck));
    const officeRam = rules.collabora.baseRamMiB + rules.collabora.ramMiBPerConcurrentUser * concurrent;
    const officeNetwork = rules.collabora.networkKbitPerConcurrentUser * concurrent;
    cpu += officeCpu;
    ramMiB += officeRam;
    serviceDiskGiB += rules.collabora.imageDiskGiB;
    networkKbit += officeNetwork;
    contributions.push({ component: "Bundled Collabora", cpu: officeCpu, ramMiB: officeRam, diskGiB: rules.collabora.imageDiskGiB, networkKbit: officeNetwork });
  }
  if (profile.features.clamav) {
    cpu += rules.clamav.cpu;
    ramMiB += rules.clamav.recommendedRamMiB;
    serviceDiskGiB += rules.clamav.diskGiB;
    contributions.push({ component: "ClamAV", cpu: rules.clamav.cpu, ramMiB: rules.clamav.recommendedRamMiB, diskGiB: rules.clamav.diskGiB });
  }
  
  // AI Proxy sizing
  if (profile.aiProxy?.enabled) {
    cpu += rules.aiProxy.cpu;
    ramMiB += rules.aiProxy.ramMiB;
    serviceDiskGiB += rules.aiProxy.diskGiB;
    contributions.push({ component: "AI Proxy", cpu: rules.aiProxy.cpu, ramMiB: rules.aiProxy.ramMiB, diskGiB: rules.aiProxy.diskGiB });
  }
  
  // AI Application sizing
  if (profile.features.aiDataInsightsSidebar) {
    cpu += rules.aiDataInsightsSidebar.cpu;
    ramMiB += rules.aiDataInsightsSidebar.ramMiB;
    contributions.push({ component: "AI Data Insights Sidebar", cpu: rules.aiDataInsightsSidebar.cpu, ramMiB: rules.aiDataInsightsSidebar.ramMiB, diskGiB: 0 });
  }
  if (profile.features.aiDocSummary) {
    cpu += rules.aiDocSummary.cpu;
    ramMiB += rules.aiDocSummary.ramMiB;
    contributions.push({ component: "AI Doc Summary", cpu: rules.aiDocSummary.cpu, ramMiB: rules.aiDocSummary.ramMiB, diskGiB: 0 });
  }
  if (profile.features.aiFolderBriefSidebar) {
    cpu += rules.aiFolderBriefSidebar.cpu;
    ramMiB += rules.aiFolderBriefSidebar.ramMiB;
    contributions.push({ component: "AI Folder Brief Sidebar", cpu: rules.aiFolderBriefSidebar.cpu, ramMiB: rules.aiFolderBriefSidebar.ramMiB, diskGiB: 0 });
  }
  if (profile.features.aiFolderReadmeGenerator) {
    cpu += rules.aiFolderReadmeGenerator.cpu;
    ramMiB += rules.aiFolderReadmeGenerator.ramMiB;
    contributions.push({ component: "AI Folder README Generator", cpu: rules.aiFolderReadmeGenerator.cpu, ramMiB: rules.aiFolderReadmeGenerator.ramMiB, diskGiB: 0 });
  }
  if (profile.features.aiImageAltTextSidebar) {
    cpu += rules.aiImageAltTextSidebar.cpu;
    ramMiB += rules.aiImageAltTextSidebar.ramMiB;
    contributions.push({ component: "AI Image Alt Text Sidebar", cpu: rules.aiImageAltTextSidebar.cpu, ramMiB: rules.aiImageAltTextSidebar.ramMiB, diskGiB: 0 });
  }
  if (profile.features.aiLlmProxy) {
    cpu += rules.aiLlmProxy.cpu;
    ramMiB += rules.aiLlmProxy.ramMiB;
    contributions.push({ component: "AI LLM Proxy", cpu: rules.aiLlmProxy.cpu, ramMiB: rules.aiLlmProxy.ramMiB, diskGiB: 0 });
  }
  if (profile.features.aiMultiDocSynthesizer) {
    cpu += rules.aiMultiDocSynthesizer.cpu;
    ramMiB += rules.aiMultiDocSynthesizer.ramMiB;
    contributions.push({ component: "AI Multi Doc Synthesizer", cpu: rules.aiMultiDocSynthesizer.cpu, ramMiB: rules.aiMultiDocSynthesizer.ramMiB, diskGiB: 0 });
  }
  if (profile.features.aiQuickDraftCreator) {
    cpu += rules.aiQuickDraftCreator.cpu;
    ramMiB += rules.aiQuickDraftCreator.ramMiB;
    contributions.push({ component: "AI Quick Draft Creator", cpu: rules.aiQuickDraftCreator.cpu, ramMiB: rules.aiQuickDraftCreator.ramMiB, diskGiB: 0 });
  }
  if (profile.features.aiSensitiveDataScanner) {
    cpu += rules.aiSensitiveDataScanner.cpu;
    ramMiB += rules.aiSensitiveDataScanner.ramMiB;
    contributions.push({ component: "AI Sensitive Data Scanner", cpu: rules.aiSensitiveDataScanner.cpu, ramMiB: rules.aiSensitiveDataScanner.ramMiB, diskGiB: 0 });
  }
  if (profile.features.aiSmartCollectionsNav) {
    cpu += rules.aiSmartCollectionsNav.cpu;
    ramMiB += rules.aiSmartCollectionsNav.ramMiB;
    contributions.push({ component: "AI Smart Collections Nav", cpu: rules.aiSmartCollectionsNav.cpu, ramMiB: rules.aiSmartCollectionsNav.ramMiB, diskGiB: 0 });
  }
  if (profile.features.aiSmartFileTaggerQa) {
    cpu += rules.aiSmartFileTaggerQa.cpu;
    ramMiB += rules.aiSmartFileTaggerQa.ramMiB;
    contributions.push({ component: "AI Smart File Tagger QA", cpu: rules.aiSmartFileTaggerQa.cpu, ramMiB: rules.aiSmartFileTaggerQa.ramMiB, diskGiB: 0 });
  }
  if (profile.features.chatWithFile) {
    cpu += rules.chatWithFile.cpu;
    ramMiB += rules.chatWithFile.ramMiB;
    contributions.push({ component: "Chat With File", cpu: rules.chatWithFile.cpu, ramMiB: rules.chatWithFile.ramMiB, diskGiB: 0 });
  }
  if (profile.features.versionChangelog) {
    cpu += rules.versionChangelog.cpu;
    ramMiB += rules.versionChangelog.ramMiB;
    contributions.push({ component: "Version Changelog", cpu: rules.versionChangelog.cpu, ramMiB: rules.versionChangelog.ramMiB, diskGiB: 0 });
  }
  
  // Other extension sizing
  if (profile.features.fileComments) {
    cpu += rules.fileComments.cpu;
    ramMiB += rules.fileComments.ramMiB;
    contributions.push({ component: "File Comments", cpu: rules.fileComments.cpu, ramMiB: rules.fileComments.ramMiB, diskGiB: 0 });
  }
  if (profile.features.groupManagement) {
    cpu += rules.groupManagement.cpu;
    ramMiB += rules.groupManagement.ramMiB;
    contributions.push({ component: "Group Management", cpu: rules.groupManagement.cpu, ramMiB: rules.groupManagement.ramMiB, diskGiB: 0 });
  }
  if (profile.features.ocisAppTokens) {
    cpu += rules.ocisAppTokens.cpu;
    ramMiB += rules.ocisAppTokens.ramMiB;
    contributions.push({ component: "oCIS App Tokens", cpu: rules.ocisAppTokens.cpu, ramMiB: rules.ocisAppTokens.ramMiB, diskGiB: 0 });
  }
  if (profile.features.vimNav) {
    cpu += rules.vimNav.cpu;
    ramMiB += rules.vimNav.ramMiB;
    contributions.push({ component: "Vim Navigation", cpu: rules.vimNav.cpu, ramMiB: rules.vimNav.ramMiB, diskGiB: 0 });
  }
  
  // Handle monitoring sizing contributions
  const monitoringConfig = profile.features.monitoring;
  if (monitoringConfig && monitoringConfig.enabled) {
    if (monitoringConfig.metrics?.enabled) {
      cpu += rules.monitoring.metrics.cpu;
      ramMiB += rules.monitoring.metrics.ramMiB;
      serviceDiskGiB += rules.monitoring.metrics.diskGiB;
      contributions.push({ component: "Metrics", cpu: rules.monitoring.metrics.cpu, ramMiB: rules.monitoring.metrics.ramMiB, diskGiB: rules.monitoring.metrics.diskGiB });
    }
    if (monitoringConfig.opentelemetry?.enabled) {
      cpu += rules.monitoring.tracing.cpu;
      ramMiB += rules.monitoring.tracing.ramMiB;
      serviceDiskGiB += rules.monitoring.tracing.diskGiB;
      contributions.push({ component: "OpenTelemetry", cpu: rules.monitoring.tracing.cpu, ramMiB: rules.monitoring.tracing.ramMiB, diskGiB: rules.monitoring.tracing.diskGiB });
    }
  }

  const minimum = {
    cpu,
    ramMiB: Math.ceil(ramMiB / 256) * 256,
    diskGiB: Math.ceil(profile.workload.storedDataGiB + serviceDiskGiB),
    networkKbit
  };
  const headroom = Math.max(30, profile.workload.headroomPercent) / 100;
  const grownDataGiB = profile.workload.storedDataGiB * (1 + profile.workload.annualGrowthPercent / 100);
  const recommended = {
    cpu: Math.ceil(cpu * (1 + headroom)),
    ramMiB: Math.ceil(ramMiB * (1 + headroom) / 256) * 256,
    diskGiB: Math.ceil((grownDataGiB + serviceDiskGiB) * (1 + headroom)),
    networkKbit: Math.ceil(networkKbit * (1 + headroom))
  };
  const systemComparison = profile.system ? {
    cpu: profile.system.cpu >= minimum.cpu ? (profile.system.cpu >= recommended.cpu ? "pass" : "warn") : "fail",
    ram: profile.system.ramMiB >= minimum.ramMiB ? (profile.system.ramMiB >= recommended.ramMiB ? "pass" : "warn") : "fail",
    disk: profile.system.diskGiB >= minimum.diskGiB ? (profile.system.diskGiB >= recommended.diskGiB ? "pass" : "warn") : "fail"
  } : null;
  return {
    formulaVersion: rules.version,
    derivedInputs: {
      peakConcurrentUsers: profile.workload.peakConcurrentUsers,
      collaboraConcurrentUsers: profile.workload.collaboraConcurrentUsers,
      expectedSpaces: profile.workload.expectedSpaces,
      annualGrowthPercent: profile.workload.annualGrowthPercent
    },
    minimum,
    recommended,
    systemComparison,
    headroomPercent: headroom * 100,
    headroomBreakdown: rules.headroomBreakdown,
    contributions,
    vocabulary: rules.vocabulary,
    productionLoadTestRequired: true,
    disclaimer: "Recommended includes transparent planning headroom but is not a capacity guarantee. Production requires representative load testing."
  };
}

export async function calculateSizing(raw) {
  const rules = await loadCatalog("sizing");
  return calculateSizingWithRules(normalizeProfileWithRules(raw, rules), rules);
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
    maturity: checked.profile.target.runtime === "kubernetes" || checked.profile.target.runtime === "podman"
      ? "community-preview"
      : "production",
    tools: requiredTools(checked.profile),
    profile: checked.profile,
    sizing,
    deterministicSecretMode: "byte-identical when the same explicit secrets file is supplied"
  };
}
