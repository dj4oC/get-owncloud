import test from "node:test";
import assert from "node:assert/strict";
import { sha256, sha256Binary } from "../src/crypto.mjs";
import { Buffer } from "node:buffer";

test("sha256 hashes string correctly", async () => {
  const testString = "Hello, World!";
  const expectedHash = "dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f";
  const result = await sha256(testString);
  assert.equal(result, expectedHash);
});

test("sha256 hashes empty string correctly", async () => {
  const expectedHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  const result = await sha256("");
  assert.equal(result, expectedHash);
});

test("sha256Binary hashes Buffer correctly", () => {
  const testString = "Hello, World!";
  const expectedHash = "dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f";
  const testBuffer = Buffer.from(testString);
  const result = sha256Binary(testBuffer);
  assert.equal(result, expectedHash);
});

test("sha256 produces consistent results", async () => {
  const testString = "Consistency test string with special chars: äöü @#$%^&*()";
  const result1 = await sha256(testString);
  const result2 = await sha256(testString);
  assert.equal(result1, result2);
});

test("sha256 and sha256Binary produce same result for same input", async () => {
  const testString = "Test for equivalence";
  const result1 = await sha256(testString);
  const result2 = sha256Binary(Buffer.from(testString));
  assert.equal(result1, result2);
});
