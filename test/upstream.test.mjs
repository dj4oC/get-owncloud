import test from "node:test";
import assert from "node:assert/strict";
import { classifyObservation, latestSameMinor, normalizeVersion } from "../scripts/upstream-discovery.mjs";

test("upstream discovery selects the newest same-minor release", () => {
  const releases = [
    { tag_name: "v8.2.1", draft: false },
    { tag_name: "v8.3.0", draft: false },
    { tag_name: "v8.2.3", draft: false },
    { tag_name: "v8.2.4-rc.1", draft: true }
  ];
  assert.equal(normalizeVersion("v8.2.3"), "8.2.3");
  assert.equal(latestSameMinor(releases, "8.2"), "8.2.3");
});

test("upstream changes are review-required and never applied automatically", () => {
  const check = { id: "source", expected: "old", policy: "manual-policy-review" };
  assert.equal(classifyObservation(check, "old").status, "current");
  assert.equal(classifyObservation(check, "new").status, "review-required");
  assert.equal(classifyObservation(check, null, "network unavailable").status, "error");
});
