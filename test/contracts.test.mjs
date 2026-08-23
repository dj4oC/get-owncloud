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
  assert.match(await read(".github/workflows/deployment-e2e.yml"), /-i 'owncloud,' -c local/);
});

test("health check validates an actual oCIS endpoint rather than container state", async () => {
  const health = await read("scripts/healthcheck.sh");
  assert.match(health, /healthz/);
  assert.match(health, /--retry 10/);
  assert.match(health, /--resolve/);
  assert.match(health, /http_code/);
  assert.match(health, /"\$status" = 200/);
});

test("runtime WebDAV reads tolerate asynchronous post-processing", async () => {
  const runtime = await read("scripts/runtime-e2e.sh");
  assert.match(runtime, /webdav_get\(\)/);
  assert.match(runtime, /--retry 20 --retry-all-errors --retry-delay 2/);
  assert.match(runtime, /webdav_get "\$WORK_DIR\/download\.txt"/);
  assert.match(runtime, /webdav_get "\$WORK_DIR\/restarted\.txt"/);
  assert.match(runtime, /webdav_get "\$WORK_DIR\/restored\.txt"/);
});

test("Docker prepares oCIS bind mounts with the container identity before startup", async () => {
  const runtime = await read("scripts/runtime-common.sh");
  const installer = await read("scripts/install.sh");
  const role = await read("ansible/roles/get_owncloud/tasks/main.yml");
  assert.match(runtime, /get_owncloud_prepare_docker_storage\(\)/);
  assert.match(runtime, /--user 0:0/);
  assert.match(runtime, /--user 1000:1000/);
  assert.match(installer, /get_owncloud_prepare_docker_storage/);
  assert.match(role, /get_owncloud_prepare_docker_storage/);
});

test("backup and restore cross Docker and rootless Podman ownership boundaries", async () => {
  const backup = await read("scripts/backup.sh");
  const restore = await read("scripts/restore.sh");
  assert.match(backup, /podman unshare cp -a/);
  assert.match(backup, /Persistent symlink is absolute/);
  assert.match(backup, /Persistent symlink escapes its storage root/);
  assert.match(backup, /cp -a \/source\/\. \/destination\//);
  assert.match(backup, /podman unshare rm -rf/);
  assert.match(backup, /--user 1000:1000/);
  assert.match(restore, /podman unshare sh/);
  assert.match(restore, /chown -R 1000:1000/);
  assert.match(restore, /Backup symbolic link escapes the extraction root/);
});

test("Ansible pulls missing images without changing every subsequent apply", async () => {
  const role = await read("ansible/roles/get_owncloud/tasks/main.yml");
  assert.match(role, /pull: missing/);
  assert.doesNotMatch(role, /pull: policy/);
});

test("bundled Collabora can activate the capabilities required by coolforkit", async () => {
  const collabora = await read("deploy/compose/template/collabora.yml");
  assert.match(collabora, /cap_add:\n\s+- MKNOD/);
  const service = collabora.slice(collabora.lastIndexOf("\n  collabora:\n"));
  assert.doesNotMatch(service, /no-new-privileges/);
});

test("Traefik shares its ping endpoint without opening a conflicting default listener", async () => {
  const compose = await read("deploy/compose/template/docker-compose.yml");
  assert.match(compose, /--ping\.entryPoint=http/);
  assert.match(compose, /--entryPoints\.http\.address=:\$\{HTTP_PORT:-80\}/);
  assert.match(compose, /--entryPoints\.https\.address=:\$\{HTTPS_PORT:-443\}/);
  assert.match(compose, /\$\{HTTP_PORT:-80\}:\$\{HTTP_PORT:-80\}/);
  assert.match(compose, /\$\{HTTPS_PORT:-443\}:\$\{HTTPS_PORT:-443\}/);
  assert.match(compose, /ocis-net: \{\}/);
});

test("Argo CD uses one Application and a namespace-scoped project", async () => {
  const application = await read("argocd/application.yaml");
  const project = await read("argocd/project.yaml");
  assert.equal((application.match(/kind: Application\n/g) ?? []).length, 1);
  assert.match(project, /clusterResourceWhitelist: \[\]/);
  assert.match(project, /namespace: owncloud/);
  assert.doesNotMatch(project, /group: "\*"|kind: "\*"/);
  assert.doesNotMatch(application, /CreateNamespace=true/);
  assert.match(application, /ingress:\n\s+enabled: false/);
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

test("rootless Podman E2E prepares image ownership explicitly and retains the write preflight", async () => {
  const runtime = await read("scripts/runtime-e2e.sh");
  const bootstrap = await read("scripts/install.sh");
  assert.match(runtime, /podman unshare chown -R 1000:1000/);
  assert.match(await read("scripts/runtime-common.sh"), /PODMAN_COMPOSE_PROVIDER.*podman-compose/);
  assert.match(await read("scripts/runtime-common.sh"), /get_owncloud_compose_validate/);
  assert.match(await read("scripts/runtime-common.sh"), /export COMPOSE_PROJECT_NAME COMPOSE_FILE/);
  assert.match(await read("src/bundle.mjs"), /runtime === "podman" \? "k8s-file" : "local"/);
  assert.match(bootstrap, /Rootless Podman cannot write bind mount/);
  assert.doesNotMatch(bootstrap, /podman unshare chown/);
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
