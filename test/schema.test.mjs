import test from "node:test";
import assert from "node:assert/strict";
import Ajv2020 from "ajv/dist/2020.js";
import { readFile, readdir } from "node:fs/promises";

const json = async (path) => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url)));

test("every maintained profile passes the public JSON schema", async () => {
  const ajv = new Ajv2020({ strict: false, validateFormats: false, allErrors: true });
  ajv.addSchema(await json("schema/sizing-input.schema.json"));
  const validate = ajv.compile(await json("schema/deployment.schema.json"));
  for (const name of (await readdir(new URL("../examples/", import.meta.url))).filter((item) => item.endsWith(".json"))) {
    const profile = await json(`examples/${name}`);
    assert.equal(validate(profile), true, `${name}: ${ajv.errorsText(validate.errors)}`);
  }
});

test("schema exposes only standard storage and Collabora choices", async () => {
  const schema = await json("schema/deployment.schema.json");
  assert.deepEqual(schema.properties.storage.properties.mode.enum, ["ocis", "s3ng"]);
  assert.deepEqual(schema.properties.office.properties.mode.enum, ["none", "collabora"]);
  assert.equal(schema.properties.storage.properties.nfsVersion.const, "4.2");
});

test("update policy catalogue passes its public schema", async () => {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  const validate = ajv.compile(await json("schema/update-policy.schema.json"));
  assert.equal(validate(await json("catalog/update-policy.json")), true, ajv.errorsText(validate.errors));
});

test("every visible configuration family has complete catalogue metadata", async () => {
  const catalogue = await json("catalog/features.json");
  const ids = new Set(catalogue.features.map((item) => item.id));
  for (const id of [
    "runtime-docker", "runtime-podman", "runtime-kubernetes", "manager-ansible", "manager-argocd",
    "identity-embedded", "identity-external", "storage-ocis", "storage-s3ng", "filesystem-nfs42",
    "office-none", "collabora-bundled", "collabora-external", "search", "clamav", "notifications",
    "tls-evaluation", "tls-acme", "security-patch-automation"
  ]) assert.ok(ids.has(id), id);
  for (const item of catalogue.features) {
    assert.ok(["community-preview", "production"].includes(item.maturity), item.id);
    assert.ok(item.targets.length > 0, item.id);
    assert.ok(Array.isArray(item.dependencies), item.id);
    assert.ok(item.resourceImpact, item.id);
    assert.ok(item.documentation, item.id);
  }
});
