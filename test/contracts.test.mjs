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
  assert.match(role, /project_src: "\{\{ get_owncloud_bundle_dir \}\}"/);
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

test("evaluation ports preserve service routing, reserve Traefik health, and make Docker repair explicit", async () => {
  const compose = await read("deploy/compose/template/docker-compose.yml");
  const ocis = await read("deploy/compose/template/ocis.yml");
  const runtime = await read("scripts/runtime-common.sh");
  assert.match(compose, /entryPoints\.traefik\.address=:8082/);
  assert.match(compose, /\$\{HTTP_PORT:-80\}:\$\{HTTP_PORT:-80\}/);
  assert.match(compose, /\$\{HTTPS_PORT:-443\}:\$\{HTTPS_PORT:-443\}/);
  assert.match(compose, /traefik:\n[\s\S]*?networks:\n\s+ocis-net: \{\}/);
  assert.match(ocis, /\n  ocis:\n[\s\S]*?networks:\n\s+ocis-net: \{\}/);
  assert.match(runtime, /get_owncloud_prepare_storage/);
  assert.match(runtime, /run_privileged chown "1000:\$storage_operator_gid"/);
  assert.doesNotMatch(runtime, /chown -R/);
});

test("recovered Docker ownership repair is recursive but confined to validated storage roots", async () => {
  const runtime = await read("scripts/runtime-common.sh");
  const restore = await read("scripts/restore.sh");
  assert.match(runtime, /get_owncloud_assert_storage_paths/);
  assert.match(runtime, /run_privileged chown -hR "1000:\$storage_operator_gid" "\$storage_config" "\$storage_data"/);
  assert.match(restore, /get_owncloud_repair_restored_storage/);
});

test("mandatory upstream notifications keep a safe default sender without enabling SMTP delivery", async () => {
  const compose = await read("deploy/compose/template/ocis.yml");
  const bundle = await read("src/bundle.mjs");
  assert.match(compose, /SMTP_SENDER:-notifications@localhost\.invalid/);
  assert.doesNotMatch(compose, /SMTP_SENDER:-[^\n]*\$\{OCIS_DOMAIN\}/);
  assert.match(bundle, /notificationServices = \["notifications"\]/);
  assert.doesNotMatch(compose, /ocis init \|\| true/);
});

test("runtime E2E does not retry a successful response after a consumer closes its pipe", async () => {
  const runtime = await read("scripts/runtime-e2e.sh");
  assert.match(runtime, /web-response\.html/);
  assert.doesNotMatch(runtime, /service_curl[^\n]+\|\s*grep/);
});

test("rootless Podman backups read subordinate-ID files inside the user namespace", async () => {
  const backup = await read("scripts/backup.sh");
  assert.match(backup, /podman unshare cp -a/);
  assert.match(backup, /podman unshare tar/);
  assert.match(backup, /run_privileged cp -a/);
  assert.match(backup, /disposable staging copy/);
});

test("restore allows only non-dangling links contained by their archive root", async () => {
  const restore = await read("scripts/restore.sh");
  assert.match(restore, /readlink -f/);
  assert.match(restore, /Backup link escapes its allowed root/);
  assert.match(restore, /Backup contains a dangling link/);
});

test("Collabora retains only its required MKNOD exception", async () => {
  const compose = await read("deploy/compose/template/collabora.yml");
  const service = compose.slice(compose.indexOf("\n  collabora:\n") + 1);
  assert.match(service, /cap_add:\n\s+- MKNOD/);
  assert.doesNotMatch(service, /privileged:/);
  assert.doesNotMatch(service, /no-new-privileges/);
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
  assert.match(deploy, /statefulset\/argocd-application-controller/);
  assert.match(deploy, /deployment\/argocd-application-controller/);
  assert.doesNotMatch(deploy, /rollout status deployment\/argocd-server/);
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

test("rootless Podman retains keep-id mapping, provider selection and the write preflight", async () => {
  const runtime = await read("scripts/runtime-e2e.sh");
  const bootstrap = await read("scripts/install.sh");
  assert.match(await read("deploy/compose/template/podman.yml"), /keep-id:uid=1000,gid=1000/);
  assert.match(await read("scripts/runtime-common.sh"), /PODMAN_COMPOSE_PROVIDER.*podman-compose/);
  assert.match(await read("scripts/runtime-common.sh"), /get_owncloud_compose_validate/);
  assert.match(await read("scripts/runtime-common.sh"), /export COMPOSE_PROJECT_NAME COMPOSE_FILE/);
  assert.match(await read("src/bundle.mjs"), /runtime === "podman" \? "k8s-file" : "local"/);
  assert.match(bootstrap, /Rootless Podman cannot write bind mount/);
  assert.doesNotMatch(bootstrap, /podman unshare chown/);
  assert.match(runtime, /get_owncloud_compose_validate/);
});

test("backup restart detection is provider-neutral", async () => {
  const backup = await read("scripts/backup.sh");
  assert.match(backup, /get_owncloud_compose ps -q 2>\/dev\/null/);
  assert.doesNotMatch(backup, /get_owncloud_compose ps -q ocis/);
});

test("Ansible only pulls missing images so a second apply stays idempotent", async () => {
  const role = await read("ansible/roles/get_owncloud/tasks/main.yml");
  assert.match(role, /pull: missing/);
  assert.doesNotMatch(role, /pull: policy/);
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
  assert.match(workflow, /get-owncloud\/ci get-owncloud\/full-e2e/);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/deployment-e2e\.yml/);
  assert.match(workflow, /tags:/);
  assert.match(workflow, /environment: production-release/);
});

test("Pages publishes only a successful main-push Full E2E commit", async () => {
  const workflow = await read(".github/workflows/pages.yml");
  assert.match(workflow, /workflows: \["Full deployment E2E"\]/);
  assert.match(workflow, /workflow_run\.event == 'push'/);
  assert.match(workflow, /workflow_run\.head_branch == 'main'/);
  assert.match(workflow, /workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /workflow_run\.head_sha \|\| github\.sha/);
});
