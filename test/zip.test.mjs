import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createZip } from "../site/zip.mjs";

test("browser ZIP output is portable, intact and preserves operator script modes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "get-owncloud-zip-"));
  const zipPath = join(directory, "bundle.zip");
  const blob = createZip({ ".env": "SECRET=local\n", "README.md": "review me\n", "install.sh": "#!/bin/sh\nexit 0\n" }, new Date(0));
  await writeFile(zipPath, new Uint8Array(await blob.arrayBuffer()));
  execFileSync("unzip", ["-t", zipPath], { stdio: "pipe" });
  execFileSync("unzip", ["-q", zipPath, "-d", directory]);
  assert.equal(await readFile(join(directory, "README.md"), "utf8"), "review me\n");
  assert.equal((await stat(join(directory, ".env"))).mode & 0o777, 0o600);
  assert.equal((await stat(join(directory, "install.sh"))).mode & 0o777, 0o755);
});
