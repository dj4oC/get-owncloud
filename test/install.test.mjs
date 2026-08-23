import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const script = new URL("../scripts/install.sh", import.meta.url);

test("bootstrap stays below 500 lines", async () => {
  const lines = (await readFile(script, "utf8")).trimEnd().split("\n").length;
  assert.ok(lines <= 500, `install.sh has ${lines} lines`);
});

test("dry-run is deterministic, reports missing tools and performs no local audit write", async () => {
  const directory = await mkdtemp(join(tmpdir(), "get-owncloud-dry-"));
  const args = [script.pathname, "--dry-run", "--target", "single-host", "--engine", "docker"];
  const first = spawnSync("sh", args, { cwd: directory, encoding: "utf8" });
  const second = spawnSync("sh", args, { cwd: directory, encoding: "utf8" });
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(first.stdout, second.stdout);
  assert.match(first.stdout, /Part 1 summary/);
  assert.match(first.stdout, /DRY RUN/);
  const audit = spawnSync("test", ["-e", join(directory, ".get-owncloud/eula-acceptance.log")]);
  assert.notEqual(audit.status, 0);
});

test("non-interactive execution fails closed without EULA acceptance", async () => {
  const directory = await mkdtemp(join(tmpdir(), "get-owncloud-eula-"));
  const bundle = join(directory, "bundle");
  const render = spawnSync(process.execPath, [
    new URL("../src/cli.mjs", import.meta.url).pathname,
    "render",
    new URL("../examples/evaluation-docker-collabora.json", import.meta.url).pathname,
    bundle,
    "--accept-eula",
    "--secrets-file",
    new URL("fixtures/e2e-secrets.json", import.meta.url).pathname
  ], { encoding: "utf8", env: { ...process.env, SOURCE_DATE_EPOCH: "0" } });
  assert.equal(render.status, 0, render.stderr);
  const fakeDocker = join(directory, "docker");
  await writeFile(fakeDocker, "#!/bin/sh\nexit 0\n");
  await chmod(fakeDocker, 0o755);
  const result = spawnSync("sh", [join(bundle, "install.sh"), "--bundle-dir", bundle, "--non-interactive", "--target", "single-host", "--engine", "docker", "--no-start"], {
    cwd: directory,
    encoding: "utf8",
    env: { ...process.env, PATH: `${directory}:${process.env.PATH}` }
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /EULA acceptance is required/);
});

test("Kubernetes/Argo dry-run includes kubectl, Helm and Argo CD readiness", () => {
  const result = spawnSync("sh", [script.pathname, "--dry-run", "--target", "kubernetes", "--manager", "argocd"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  for (const tool of ["kubectl", "helm", "argocd"]) assert.match(result.stdout, new RegExp(tool, "i"));
  assert.match(result.stdout, /Argo CD controller status:/);
  assert.match(result.stdout, /never mutates a controller/);
});
