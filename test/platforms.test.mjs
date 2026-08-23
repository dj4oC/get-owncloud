import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const prerequisites = JSON.parse(await readFile(new URL("../catalog/prerequisites.json", import.meta.url), "utf8"));

test("the full requested distribution matrix remains represented", () => {
  const ids = new Set(prerequisites.platforms.map((platform) => platform.id));
  for (const id of [
    "ubuntu-22.04", "ubuntu-24.04", "debian-12", "rhel-9", "centos-stream-9",
    "rocky-9", "alma-9", "fedora-current", "opensuse-tumbleweed", "sles-15-sp6"
  ]) assert.ok(ids.has(id), id);
});

test("every selected tool has a readiness contract", () => {
  for (const tool of ["docker", "podman", "kubernetes", "helm", "ansible", "argocd"]) {
    assert.ok(prerequisites.tools[tool], tool);
    assert.ok(prerequisites.tools[tool].detect.length > 0, tool);
  }
  assert.equal(prerequisites.tools.argocd.v1Install, "cli-only");
});
