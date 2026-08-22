import test from "node:test";
import assert from "node:assert/strict";
import {
  assertEffectiveNfs42,
  buildDeploymentPlan,
  calculateSizing,
  detectEffectiveNfsVersion,
  normalizeProfile,
  validateProfile
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

test("Helm and Argo CD remain present but blocked on the incompatible chart pin", async () => {
  const result = await validateProfile(profile({
    identity: { mode: "external-oidc" },
    target: { runtime: "kubernetes", manager: "argocd" }
  }));
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /blocked|inherits/);
});

test("same normalized non-secret input produces identical plans", async () => {
  const input = profile({ office: { mode: "collabora", deployment: "external" } });
  assert.deepEqual(await buildDeploymentPlan(input), await buildDeploymentPlan(input));
});
