import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { renderProfile } from "../src/render.mjs";

const load = async (path) => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url)));
const secrets = await load("test/fixtures/e2e-secrets.json");
const acceptance = { acceptedAt: new Date(0).toISOString(), acceptedBy: "unit-test" };

test("single-host renderer emits a verified runnable and permission-safe bundle", async () => {
  const outputDirectory = await mkdtemp(join(tmpdir(), "get-owncloud-render-"));
  const result = await renderProfile({ rawProfile: await load("examples/evaluation-docker-collabora.json"), outputDirectory, secrets, acceptance });
  for (const required of [".env", "docker-compose.yml", "ocis.yml", "collabora.yml", "install.sh", "manifest.sha256"]) {
    assert.ok(result.files[required], required);
  }
  assert.equal((await stat(join(outputDirectory, ".env"))).mode & 0o777, 0o600);
  assert.equal((await stat(join(outputDirectory, "install.sh"))).mode & 0o777, 0o755);
  const verified = spawnSync("sha256sum", ["-c", "manifest.sha256"], { cwd: outputDirectory, encoding: "utf8" });
  assert.equal(verified.status, 0, verified.stderr);
  const environment = await readFile(join(outputDirectory, ".env"), "utf8");
  assert.match(environment, /OCIS_IMAGE="docker\.io\/owncloud\/ocis@sha256:[0-9a-f]{64}"/);
  assert.match(environment, /S3NG_ACCESS_KEY=""/);
  assert.match(environment, /LDAP_BIND_PASSWORD=""/);
  await writeFile(join(outputDirectory, "ocis.yml"), "tampered\n");
  const tampered = spawnSync("sha256sum", ["-c", "manifest.sha256"], { cwd: outputDirectory, encoding: "utf8" });
  assert.notEqual(tampered.status, 0);
});

test("Podman Ansible output carries the shared runtime helper and thin role", async () => {
  const outputDirectory = await mkdtemp(join(tmpdir(), "get-owncloud-podman-ansible-"));
  const profile = await load("examples/evaluation-podman.json");
  profile.target.manager = "ansible";
  const result = await renderProfile({ rawProfile: profile, outputDirectory, secrets, acceptance });
  for (const required of [
    "scripts/runtime-common.sh",
    "ansible/playbook.yml",
    "ansible/requirements.yml",
    "ansible/roles/get_owncloud/tasks/main.yml"
  ]) assert.ok(result.files[required], required);
  assert.match(result.files[".env"], /GET_OWNCLOUD_RUNTIME="podman"/);
  assert.match(result.files[".env"], /LOG_DRIVER="k8s-file"/);
  assert.match(result.files[".env"], /OCIS_BIND_RW_OPTIONS=":z"/);
  assert.match(result.files["podman.yml"], /keep-id:uid=1000,gid=1000/);
  assert.match(result.files["README.md"], /ansible-playbook/);
  assert.match(result.files["README.md"], /-i "owncloud,"/);
});

test("Kubernetes renderer preserves issue #6 at chart 0.7.0 and oCIS 7.1.4", async () => {
  const outputDirectory = await mkdtemp(join(tmpdir(), "get-owncloud-k8s-"));
  const result = await renderProfile({ rawProfile: await load("examples/kubernetes-7.1.4-preview.json"), outputDirectory, secrets, acceptance });
  assert.match(result.files["values.yaml"], /tag: "7\.1\.4"/);
  assert.match(result.files["values.yaml"], /ingress:\n\s+enabled: false/);
  assert.match(result.files["deployment.lock.json"], /"openIssue": 6/);
  assert.match(result.files["argocd/application.yaml"], /targetRevision: "0\.7\.0"/);
  assert.ok(result.files["nfs-verifier.yaml"].includes("4\\.2"));
});
