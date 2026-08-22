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
  assert.match(playbook, /community\.docker\.docker_compose_v2/);
  assert.match(playbook, /project_src: "\{\{ owncloud_bundle_dir \}\}"/);
  assert.match(playbook, /no_log:/);
});

test("health check validates an actual oCIS endpoint rather than container state", async () => {
  const health = await read("scripts/healthcheck.sh");
  assert.match(health, /healthz/);
  assert.match(health, /--retry 5/);
  assert.match(health, /body=\$\(curl/);
  assert.match(health, /empty body/);
});

test("Argo CD uses one Application and a namespace-scoped project", async () => {
  const application = await read("argocd/application.yaml");
  const project = await read("argocd/project.yaml");
  assert.equal((application.match(/kind: Application\n/g) ?? []).length, 1);
  assert.match(project, /clusterResourceWhitelist: \[\]/);
  assert.match(project, /namespace: owncloud/);
});

test("security update defaults are narrow and breaking updates are never automatic", async () => {
  const policy = await json("catalog/update-policy.json");
  assert.equal(policy.automaticSecurityUpdates, true);
  assert.equal(policy.observationDelayHours, 24);
  assert.equal(policy.breakingAutomatic, false);
  for (const marker of ["migration", "storage-schema", "idm-schema", "unknown"]) assert.ok(policy.manualOnly.includes(marker));
});

test("sizing formula version is recorded in the changelog", async () => {
  const sizing = await json("catalog/sizing.json");
  assert.match(await read("CHANGELOG.md"), new RegExp(sizing.version.replaceAll(".", "\\.")));
});
