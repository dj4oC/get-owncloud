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
