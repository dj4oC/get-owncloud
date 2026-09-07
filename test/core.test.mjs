import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  assertEffectiveNfs42,
  buildDeploymentPlan,
  calculateSizing,
  detectEffectiveNfsVersion,
  normalizeProfile,
  normalizeProfileWithRules,
  validateProfile,
  loadCatalog
} from "../src/core.mjs";

function profile(overrides = {}) {
  const base = {
    apiVersion: "get.owncloud.com/v1alpha1",
    purpose: "evaluation",
    target: { runtime: "docker", manager: "direct" },
    workload: { registeredUsers: 20, storedDataGiB: 100 },
    identity: { mode: "embedded" },
    storage: { mode: "ocis", filesystem: "ext4" },
    office: { mode: "none" },
    features: {}
  };
  return { ...base, ...overrides };
}

test("embedded identity accepts 20 users and rejects 21", async () => {
  assert.equal((await validateProfile(profile())).valid, true);
  const invalid = await validateProfile(profile({ workload: { registeredUsers: 21, storedDataGiB: 100 } }));
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join(" "), /limited to 20/);
});

test("Collabora is the only office integration", async () => {
  const collabora = await validateProfile(profile({ office: { mode: "collabora", deployment: "bundled" } }));
  assert.equal(collabora.valid, true);
  const other = await validateProfile(profile({ office: { mode: "onlyoffice", deployment: "bundled" } }));
  assert.equal(other.valid, false);
  assert.match(other.errors.join(" "), /Collabora|Denied value/);
});

test("Collabora bundled mode is supported for Kubernetes", async () => {
  const bundled = await validateProfile(profile({
    target: { runtime: "kubernetes", manager: "direct" },
    office: { mode: "collabora", deployment: "bundled" },
    networking: { 
      domain: "example.com", 
      collaboraDomain: "collabora.example.com", 
      ingressClassName: "nginx",
      tlsSecretName: "tls-secret",
      tls: { mode: "evaluation-self-signed" } 
    }
  }));
  assert.equal(bundled.valid, true);
});

test("Collabora external mode with HTTPS URL is valid", async () => {
  const external = await validateProfile(profile({
    office: { mode: "collabora", deployment: "external", url: "https://collabora.example.com" }
  }));
  assert.equal(external.valid, true);
});

test("Collabora external mode requires HTTPS URL", async () => {
  const invalid = await validateProfile(profile({
    office: { mode: "collabora", deployment: "external", url: "http://collabora.example.com" }
  }));
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join(" "), /External Collabora must use an HTTPS URL/);
});

// Keycloak identity mode tests
test("Keycloak identity mode is supported", async () => {
  const keycloak = await validateProfile(profile({
    identity: { mode: "keycloak", clientId: "web" }
  }));
  assert.equal(keycloak.valid, true);
});

test("Keycloak requires clientId", async () => {
  const invalid = await validateProfile(profile({
    identity: { mode: "keycloak" }
  }));
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join(" "), /Keycloak requires clientId/);
});

test("Keycloak for Kubernetes requires secret references", async () => {
  const invalid = await validateProfile(profile({
    target: { runtime: "kubernetes", manager: "direct" },
    identity: { mode: "keycloak", clientId: "web" },
    networking: { domain: "example.com", ingressClassName: "nginx", tlsSecretName: "tls-secret", tls: { mode: "evaluation-self-signed" } }
  }));
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join(" "), /Kubernetes Keycloak requires keycloakAdminPasswordSecretRef/);
});

test("Keycloak for Kubernetes with all secrets is valid", async () => {
  const valid = await validateProfile(profile({
    target: { runtime: "kubernetes", manager: "direct" },
    identity: { 
      mode: "keycloak", 
      clientId: "web",
      keycloakAdminPasswordSecretRef: "keycloak-admin-secret",
      keycloakDatabasePasswordSecretRef: "keycloak-db-secret"
    },
    networking: { domain: "example.com", ingressClassName: "nginx", tlsSecretName: "tls-secret", tls: { mode: "evaluation-self-signed" } }
  }));
  assert.equal(valid.valid, true);
});

// Tika feature tests
test("Tika can be enabled as boolean", async () => {
  const tikab = await validateProfile(profile({ features: { tika: true } }));
  assert.equal(tikab.valid, true);
});

test("Tika can be enabled as standard string", async () => {
  const tikaStandard = await validateProfile(profile({ features: { tika: "standard" } }));
  assert.equal(tikaStandard.valid, true);
});

test("Tika can be enabled as full string", async () => {
  const tikaFull = await validateProfile(profile({ features: { tika: "full" } }));
  assert.equal(tikaFull.valid, true);
});

test("Tika can be enabled as object with custom configuration", async () => {
  const tika = await validateProfile(profile({ 
    features: { 
      tika: {
        mode: "full",
        imageDigest: "sha256:5fd0590937349d7e1a54197d05f6f6f0f7d1d7e1a54197d05f6f6f0f7d1d7e1",
        storageClassName: "fast",
        sizeGiB: 4,
        cpu: 2,
        memoryMiB: 4096
      }
    }
  }));
  assert.equal(tika.valid, true);
});

test("Tika Kubernetes requires storageClassName", async () => {
  const invalid = await validateProfile(profile({
    target: { runtime: "kubernetes", manager: "direct" },
    features: { tika: { mode: "standard" } },
    networking: { domain: "example.com", ingressClassName: "nginx", tlsSecretName: "tls-secret", tls: { mode: "evaluation-self-signed" } }
  }));
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join(" "), /Kubernetes Tika requires storageClassName/);
});

test("Tika normalization sets defaults", async () => {
  const normalized = await normalizeProfileWithRules(
    profile({ features: { tika: true } }),
    await loadCatalog("sizing")
  );
  assert.equal(normalized.features.tika.mode, "standard");
  assert.equal(normalized.features.tika.imageDigest, "sha256:4fd0590937349d7e1a54197d05f6f6f0f7d1d7e1a54197d05f6f6f0f7d1d7e1");
  assert.equal(normalized.features.tika.sizeGiB, 2);
  assert.equal(normalized.features.tika.cpu, 1);
  assert.equal(normalized.features.tika.memoryMiB, 2048);
});

test("Tika contributes to sizing calculation", async () => {
  const withTika = await calculateSizing(profile({ features: { tika: true } }));
  const withoutTika = await calculateSizing(profile({ features: { tika: false } }));
  
  // Tika should add its resource contributions
  assert.ok(withTika.minimum.cpu > withoutTika.minimum.cpu);
  assert.ok(withTika.minimum.ramMiB > withoutTika.minimum.ramMiB);
  assert.ok(withTika.minimum.diskGiB > withoutTika.minimum.diskGiB);
  
  // Check that Tika is in the contributions
  const tikaContribution = withTika.contributions.find(c => c.component === "Tika");
  assert.ok(tikaContribution);
  assert.equal(tikaContribution.cpu, 1);
  assert.equal(tikaContribution.ramMiB, 2048);
  assert.equal(tikaContribution.diskGiB, 2);
});

// Classic web extensions tests
test("Draw.io can be enabled", async () => {
  const drawio = await validateProfile(profile({ features: { drawio: true } }));
  assert.equal(drawio.valid, true);
});

test("JSON Viewer can be enabled", async () => {
  const jsonViewer = await validateProfile(profile({ features: { jsonViewer: true } }));
  assert.equal(jsonViewer.valid, true);
});

test("Photo Add-on can be enabled", async () => {
  const photoAddon = await validateProfile(profile({ features: { photoAddon: true } }));
  assert.equal(photoAddon.valid, true);
});

test("Unzip can be enabled", async () => {
  const unzip = await validateProfile(profile({ features: { unzip: true } }));
  assert.equal(unzip.valid, true);
});

test("External Sites can be enabled with valid sites", async () => {
  const externalSites = await validateProfile(profile({ 
    features: { 
      externalSites: [
        { id: "site1", name: "Site 1", url: "https://example.com" }
      ]
    }
  }));
  assert.equal(externalSites.valid, true);
});

test("External Sites rejects duplicate IDs", async () => {
  const invalid = await validateProfile(profile({ 
    features: { 
      externalSites: [
        { id: "site1", name: "Site 1", url: "https://example.com" },
        { id: "site1", name: "Site 2", url: "https://example2.com" }
      ]
    }
  }));
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join(" "), /Duplicate external site id/);
});

test("External Sites rejects non-HTTPS URLs", async () => {
  const invalid = await validateProfile(profile({ 
    features: { 
      externalSites: [
        { id: "site1", name: "Site 1", url: "http://example.com" }
      ]
    }
  }));
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join(" "), /External site URL must be HTTPS/);
});

test("External Sites rejects missing required fields", async () => {
  const invalid = await validateProfile(profile({ 
    features: { 
      externalSites: [
        { name: "Site 1", url: "https://example.com" }
      ]
    }
  }));
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join(" "), /External site must have a non-empty id/);
});

test("notifications require a valid SMTP host in evaluation and production", async () => {
  const invalid = await validateProfile(profile({ features: { notifications: true } }));
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join(" "), /SMTP host is required/);
  const valid = await validateProfile(profile({
    features: { notifications: true },
    mail: { host: "smtp.example.com", sender: "noreply@cloud.test" }
  }));
  assert.equal(valid.valid, true, valid.errors.join(" "));
});

test("forbidden storage and experimental maturity fail closed", async () => {
  for (const mode of ["posixfs", "xattr", "gpfs", "cifs"]) {
    const result = await validateProfile(profile({ storage: { mode } }));
    assert.equal(result.valid, false, mode);
  }
  const experimental = await validateProfile(profile({ maturity: "experimental" }));
  assert.equal(experimental.valid, false);
});

test("NFS requires declared and effective v4.2", async () => {
  const declared = await validateProfile(profile({ storage: { mode: "nfs", filesystem: "nfs", nfsVersion: "4.1" } }));
  assert.equal(declared.valid, false);
  const text = "server:/data /srv/ocis nfs4 rw,relatime,vers=4.2,proto=tcp 0 0";
  assert.equal(detectEffectiveNfsVersion(text), "4.2");
  assert.equal(assertEffectiveNfs42(text).valid, true);
  assert.equal(assertEffectiveNfs42("server:/data /srv nfs4 rw,vers=4.1").valid, false);
});

test("uncertain workload inputs receive conservative defaults", async () => {
  const normalized = await normalizeProfile(profile({
    workload: { registeredUsers: 100, storedDataGiB: 100 },
    office: { mode: "collabora", deployment: "bundled" }
  }));
  assert.equal(normalized.workload.peakConcurrentUsers, 10);
  assert.equal(normalized.workload.collaboraConcurrentUsers, 5);
  assert.equal(normalized.workload.expectedSpaces, 150);
});

test("sizing separates minimum and recommended with explained 30 percent headroom", async () => {
  const result = await calculateSizing(profile({
    purpose: "production",
    identity: { mode: "external-oidc" },
    workload: { registeredUsers: 100, storedDataGiB: 100, collaboraConcurrentUsers: 10 },
    office: { mode: "collabora", deployment: "bundled" },
    features: { clamav: true }
  }));
  assert.equal(result.headroomPercent, 30);
  assert.ok(result.recommended.cpu > result.minimum.cpu);
  assert.ok(result.recommended.ramMiB > result.minimum.ramMiB);
  assert.equal(result.productionLoadTestRequired, true);
  assert.deepEqual(result.headroomBreakdown, {
    backgroundTasksPercent: 15,
    requestSpikesPercent: 10,
    observabilityPercent: 5
  });
});

test("Helm and Argo CD are runnable only at the held 7.1.4 Community Preview boundary", async () => {
  const example = JSON.parse(await readFile(new URL("../examples/kubernetes-7.1.4-preview.json", import.meta.url)));
  const result = await validateProfile(example);
  assert.equal(result.valid, true, result.errors.join(" "));
  const upgraded = await validateProfile({ ...example, ocisVersion: "8.2.0" });
  assert.equal(upgraded.valid, false);
  assert.match(upgraded.errors.join(" "), /held at oCIS 7\.1\.4/);
  const production = await validateProfile({ ...example, purpose: "production" });
  assert.equal(production.valid, false);
  assert.match(production.errors.join(" "), /open issue #6/);
});

test("same normalized non-secret input produces identical plans", async () => {
  const input = profile({ office: { mode: "collabora", deployment: "external" } });
  assert.deepEqual(await buildDeploymentPlan(input), await buildDeploymentPlan(input));
});

test("reserved example names and IP addresses are never accepted as production domains", async () => {
  const base = profile({
    purpose: "production",
    identity: {
      mode: "external-oidc",
      issuer: "https://id.corp.example",
      clientId: "web",
      ldapUri: "ldaps://ldap.corp.example:636",
      ldapBindDn: "uid=ocis,dc=corp,dc=example",
      ldapUserBaseDn: "ou=users,dc=corp,dc=example",
      ldapGroupBaseDn: "ou=groups,dc=corp,dc=example"
    },
    networking: {
      domain: "cloud.example.net",
      httpPort: 80,
      httpsPort: 443,
      tls: { mode: "acme", email: "hostmaster@corp.example" }
    },
    features: { notifications: false },
    updates: { automaticSecurityPatches: false, observationDelayHours: 24 }
  });
  for (const domain of ["cloud.example.net", "cloud.example", "192.0.2.10"]) {
    const result = await validateProfile({ ...base, networking: { ...base.networking, domain } });
    assert.equal(result.valid, false, domain);
    assert.match(result.errors.join(" "), /real FQDN/);
  }
});

test("single-host profiles reject the internal Traefik health port", async () => {
  const input = profile({ networking: { httpPort: 8082 } });
  const result = await validateProfile(input);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("8082")));
});

test("storage paths reject root, traversal and identical targets", async () => {
  for (const storage of [
    { mode: "ocis", filesystem: "ext4", dataPath: "/", configPath: "./config" },
    { mode: "ocis", filesystem: "ext4", dataPath: "../data", configPath: "./config" },
    { mode: "ocis", filesystem: "ext4", dataPath: "./same", configPath: "./same" },
    { mode: "ocis", filesystem: "ext4", dataPath: "./data", configPath: "./data/config" }
  ]) {
    const result = await validateProfile(profile({ storage }));
    assert.equal(result.valid, false);
    assert.match(result.errors.join(" "), /safe persistent|must be distinct|must not be nested/);
  }
});

// AI Proxy Configuration Tests
test("AI Proxy can be enabled as boolean", async () => {
  const result = await validateProfile(profile({ aiProxy: true }));
  assert.equal(result.valid, true, result.errors.join(" "));
});

test("AI Proxy can be enabled as object with custom configuration", async () => {
  const result = await validateProfile(profile({
    aiProxy: {
      enabled: true,
      endpoint: "https://ai-proxy.example.com",
      apiKeySecretRef: "ai-proxy-api-key",
      defaultTextModel: "gpt-4",
      visionModel: "gpt-4-vision",
      requestTimeout: 60,
      tls: { enabled: true, customCA: true, caSecretRef: "ai-proxy-ca" },
      maxInputSize: 2097152,
      maxOutputSize: 2097152,
      maxConcurrency: 20
    }
  }));
  assert.equal(result.valid, true, result.errors.join(" "));
});

test("AI Proxy requires HTTPS endpoint", async () => {
  const invalid = await validateProfile(profile({
    aiProxy: {
      enabled: true,
      endpoint: "http://ai-proxy.example.com"
    }
  }));
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join(" "), /HTTPS/);
});

test("AI Proxy enabled requires endpoint", async () => {
  const invalid = await validateProfile(profile({
    aiProxy: {
      enabled: true
      // No endpoint
    }
  }));
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join(" "), /endpoint/);
});

test("AI Proxy normalization sets defaults", async () => {
  const normalized = await normalizeProfile(profile({ aiProxy: true }));
  assert.equal(normalized.aiProxy.enabled, true);
  assert.equal(normalized.aiProxy.endpoint, "");
  assert.equal(normalized.aiProxy.defaultTextModel, "gpt-4");
  assert.equal(normalized.aiProxy.requestTimeout, 30);
  assert.equal(normalized.aiProxy.maxInputSize, 1048576);
});

test("AI Proxy disabled by default", async () => {
  const normalized = await normalizeProfile(profile({}));
  assert.equal(normalized.aiProxy, false);
});

// Demo Content Configuration Tests
test("Demo Content can be enabled", async () => {
  const result = await validateProfile(profile({
    demoContent: {
      enabled: true,
      optInRequired: true,
      destructiveWarning: true,
      licenses: ["MIT", "Apache-2.0"],
      sampleFiles: [],
      resetPath: "/reset-demo"
    }
  }));
  assert.equal(result.valid, true, result.errors.join(" "));
});

test("Demo Content requires destructive warning", async () => {
  const invalid = await validateProfile(profile({
    demoContent: {
      enabled: true,
      destructiveWarning: false
    }
  }));
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join(" "), /destructive warning/);
});

// AI Application Dependency Tests
test("AI applications require AI Proxy to be enabled", async () => {
  const invalid = await validateProfile(profile({
    features: { aiDataInsightsSidebar: true }
    // No AI proxy enabled
  }));
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join(" "), /AI applications require aiProxy/);
});

test("Image Alt Text requires vision model", async () => {
  const invalid = await validateProfile(profile({
    aiProxy: { enabled: true, endpoint: "https://ai-proxy.example.com" },
    features: { aiImageAltTextSidebar: true }
    // No vision model
  }));
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join(" "), /vision-capable model/);
});

// AI Application Sizing Tests
test("AI Proxy contributes to sizing calculation", async () => {
  const withAiProxy = await calculateSizing(profile({
    aiProxy: { enabled: true, endpoint: "https://ai-proxy.example.com" }
  }));
  const withoutAiProxy = await calculateSizing(profile({ aiProxy: false }));
  
  assert.ok(withAiProxy.minimum.cpu > withoutAiProxy.minimum.cpu);
  assert.ok(withAiProxy.minimum.ramMiB > withoutAiProxy.minimum.ramMiB);
  
  const aiProxyContribution = withAiProxy.contributions.find(c => c.component === "AI Proxy");
  assert.ok(aiProxyContribution);
  assert.equal(aiProxyContribution.cpu, 2);
  assert.equal(aiProxyContribution.ramMiB, 4096);
});

test("AI Data Insights Sidebar contributes to sizing calculation", async () => {
  const withAi = await calculateSizing(profile({
    aiProxy: { enabled: true, endpoint: "https://ai-proxy.example.com" },
    features: { aiDataInsightsSidebar: true }
  }));
  const withoutAi = await calculateSizing(profile({
    aiProxy: { enabled: true, endpoint: "https://ai-proxy.example.com" },
    features: { aiDataInsightsSidebar: false }
  }));
  
  assert.ok(withAi.minimum.cpu > withoutAi.minimum.cpu);
  assert.ok(withAi.minimum.ramMiB > withoutAi.minimum.ramMiB);
  
  const aiContribution = withAi.contributions.find(c => c.component === "AI Data Insights Sidebar");
  assert.ok(aiContribution);
  assert.equal(aiContribution.cpu, 0.5);
  assert.equal(aiContribution.ramMiB, 512);
});
