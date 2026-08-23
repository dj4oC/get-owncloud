import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { classifyUpdate } from "../update/classify.mjs";

test("eligible same-minor security patch waits 24 hours", () => {
  const result = classifyUpdate(
    { version: "8.2.1" },
    { version: "8.2.2", security: true, breaking: false, migration: false, rollbackSafe: true, backupReady: true }
  );
  assert.deepEqual(result, { automatic: true, delayHours: 24, reason: "eligible-same-minor-security-patch" });
});

test("the signed update feed and service fail closed on storage and IDM schema changes", async () => {
  const service = await readFile(new URL("../scripts/update-service.sh", import.meta.url), "utf8");
  const feed = await readFile(new URL("../releases/stable-8.2.env", import.meta.url), "utf8");
  for (const marker of ["STORAGE_SCHEMA", "IDM_SCHEMA"]) {
    assert.match(service, new RegExp(`${marker}=\\$\\(candidate_get ${marker}\\)`));
    assert.match(service, new RegExp(`\\$${marker}.*!= false`));
    assert.match(feed, new RegExp(`^${marker}=false$`, "m"));
  }
});

test("minor, migration, storage and IDM changes are never automatic", () => {
  const candidates = [
    { version: "8.3.0", security: true, rollbackSafe: true, backupReady: true },
    { version: "8.2.2", security: true, migration: true, rollbackSafe: true, backupReady: true },
    { version: "8.2.2", security: true, storageSchema: true, rollbackSafe: true, backupReady: true },
    { version: "8.2.2", security: true, idmSchema: true, rollbackSafe: true, backupReady: true }
  ];
  for (const candidate of candidates) assert.equal(classifyUpdate({ version: "8.2.1" }, candidate).automatic, false);
});
