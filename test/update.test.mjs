import test from "node:test";
import assert from "node:assert/strict";
import { classifyUpdate } from "../update/classify.mjs";

test("eligible same-minor security patch waits 24 hours", () => {
  const result = classifyUpdate(
    { version: "8.2.1" },
    { version: "8.2.2", security: true, breaking: false, migration: false, rollbackSafe: true, backupReady: true }
  );
  assert.deepEqual(result, { automatic: true, delayHours: 24, reason: "eligible-same-minor-security-patch" });
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
