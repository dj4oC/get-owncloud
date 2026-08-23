import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const json = async (path) => JSON.parse(await read(path));

test("browser journey catalogue covers every deployment target and critical boundary", async () => {
  const journeys = (await json("catalog/browser-journeys.json")).journeys;
  const serialized = JSON.stringify(journeys);
  for (const item of ["docker", "podman", "kubernetes", "argocd", "ansible", "identity-20", "identity-21", "collabora", "posixfs", "eula"]) {
    assert.ok(serialized.includes(item), item);
  }
});

test("Ansible is a thin module wrapper around the locked bundle with secret redaction", async () => {
  const playbook = await read("ansible/playbook.yml");
  const role = await read("ansible/roles/get_owncloud/tasks/main.yml");
  assert.match(playbook, /role: get_owncloud/);
  assert.match(role, /community\.docker\.docker_compose_v2/);
  assert.match(role, /project_src: "\{\{ owncloud_bundle_dir \}\}"/);
  assert.match(role, /no_log:/);
});

test("health check validates an actual oCIS endpoint rather than container state", async () => {
  const health = await read("scripts/healthcheck.sh");
  assert.match(health, /healthz/);
  assert.match(health, /--retry 10/);
  assert.match(health, /--resolve/);
  assert.match(health, /http_code/);
  assert.match(health, /"\$status" = 200/);
});

test("Argo CD uses one Application and a namespace-scoped project", async () => {
  const application = await read("argocd/application.yaml");
  const project = await read("argocd/project.yaml");
  assert.equal((application.match(/kind: Application\n/g) ?? []).length, 1);
  assert.match(project, /clusterResourceWhitelist: \[\]/);
  assert.match(project, /namespace: owncloud/);
  assert.doesNotMatch(project, /group: "\*"|kind: "\*"/);
  assert.doesNotMatch(application, /CreateNamespace=true/);
});

test("Argo deployment refuses a missing or unauthorized existing controller", async () => {
  const deploy = await read("scripts/deploy-kubernetes.sh");
  assert.match(deploy, /applications\.argoproj\.io/);
  assert.match(deploy, /appprojects\.argoproj\.io/);
  assert.match(deploy, /rollout status deployment\/argocd-server/);
  assert.match(deploy, /kubectl auth can-i create applications/);
  assert.doesNotMatch(deploy, /--create-namespace/);
});

test("security update defaults are narrow and breaking updates are never automatic", async () => {
  const policy = await json("catalog/update-policy.json");
  assert.equal(policy.automaticSecurityUpdates, true);
  assert.equal(policy.observationDelayHours, 24);
  assert.equal(policy.breakingAutomatic, false);
  for (const marker of ["migration", "storage-schema", "idm-schema", "unknown"]) assert.ok(policy.manualOnly.includes(marker));
});

test("Docker security updates have explicit systemd and cron scheduler contracts", async () => {
  const bootstrap = await read("scripts/install.sh");
  assert.match(bootstrap, /systemctl enable --now "\$timer"/);
  assert.match(bootstrap, /\/etc\/cron\.d\/get-owncloud-update-/);
  assert.match(bootstrap, /operator-controlled backup recipient/);
  assert.match(bootstrap, /Scheduled updates require a bundle path without spaces or shell metacharacters/);
});

test("sizing formula version is recorded in the changelog", async () => {
  const sizing = await json("catalog/sizing.json");
  assert.match(await read("CHANGELOG.md"), new RegExp(sizing.version.replaceAll(".", "\\.")));
});

test("release provenance generates an SPDX SBOM before attestation", async () => {
  assert.match(await read("scripts/generate-sbom.mjs"), /SPDX-2\.3/);
  const workflow = await read(".github/workflows/release.yml");
  assert.match(workflow, /generate-sbom\.mjs/);
  assert.match(workflow, /attest-build-provenance@/);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/deployment-e2e\.yml/);
  assert.match(workflow, /tags:/);
});
