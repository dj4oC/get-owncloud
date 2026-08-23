import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";

const restore = new URL("../scripts/restore.sh", import.meta.url).pathname;

async function archiveWithLink(target) {
  const directory = await mkdtemp(join(tmpdir(), "get-owncloud-link-"));
  const source = join(directory, "source");
  const bundle = join(directory, "bundle");
  const archive = join(directory, "backup.tar.gz");
  await mkdir(join(source, "persistent/config"), { recursive: true });
  await mkdir(bundle);
  await writeFile(join(bundle, ".env"), 'GET_OWNCLOUD_OCIS_VERSION="8.2.0"\n');
  if (target === "target") await writeFile(join(source, "persistent/config/target"), "safe\n");
  await symlink(target, join(source, "persistent/config/link"));
  const packed = spawnSync("tar", ["-C", source, "-czf", archive, "persistent"], { encoding: "utf8" });
  assert.equal(packed.status, 0, packed.stderr);
  const checksum = spawnSync("sha256sum", [basename(archive)], { cwd: directory, encoding: "utf8" });
  assert.equal(checksum.status, 0, checksum.stderr);
  await writeFile(`${archive}.sha256`, checksum.stdout);
  return { archive, bundle };
}

test("restore accepts an internal link before applying normal archive validation", async () => {
  const { archive, bundle } = await archiveWithLink("target");
  const result = spawnSync("sh", [restore, "--bundle-dir", bundle, "--archive", archive], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Invalid backup: missing metadata/);
  assert.doesNotMatch(result.stderr, /Backup link/);
});

test("restore rejects an absolute link that escapes its archive root", async () => {
  const { archive, bundle } = await archiveWithLink("/etc/passwd");
  const result = spawnSync("sh", [restore, "--bundle-dir", bundle, "--archive", archive], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Backup link escapes its allowed root/);
});

test("restore rejects dangling links", async () => {
  const { archive, bundle } = await archiveWithLink("missing-target");
  const result = spawnSync("sh", [restore, "--bundle-dir", bundle, "--archive", archive], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Backup contains a dangling link/);
});
