import test from "node:test";
import assert from "node:assert/strict";
import { deepClone, canDeepClone } from "../src/clone.mjs";

test("deepClone handles primitives", () => {
  assert.equal(deepClone(null), null);
  assert.equal(deepClone(undefined), undefined);
  assert.equal(deepClone(0), 0);
  assert.equal(deepClone(42), 42);
  assert.equal(deepClone(""), "");
  assert.equal(deepClone("hello"), "hello");
  assert.equal(deepClone(true), true);
  assert.equal(deepClone(false), false);
});

test("deepClone handles arrays", () => {
  const arr = [1, 2, { a: 3 }];
  const cloned = deepClone(arr);
  assert.notEqual(cloned, arr);
  assert.equal(cloned.length, arr.length);
  assert.equal(cloned[0], arr[0]);
  assert.equal(cloned[1], arr[1]);
  assert.notEqual(cloned[2], arr[2]);
  assert.deepEqual(cloned[2], arr[2]);
});

test("deepClone handles plain objects", () => {
  const obj = { a: 1, b: { c: 2 } };
  const cloned = deepClone(obj);
  assert.notEqual(cloned, obj);
  assert.equal(cloned.a, obj.a);
  assert.notEqual(cloned.b, obj.b);
  assert.deepEqual(cloned.b, obj.b);
});

test("deepClone handles Dates", () => {
  const date = new Date("2024-01-01T12:00:00.000Z");
  const cloned = deepClone(date);
  assert.notEqual(cloned, date);
  assert.equal(cloned.getTime(), date.getTime());
  assert.equal(cloned instanceof Date, true);
});

test("deepClone handles RegExps", () => {
  const regex = /test/gi;
  const cloned = deepClone(regex);
  assert.notEqual(cloned, regex);
  assert.equal(cloned.source, regex.source);
  assert.equal(cloned.flags, regex.flags);
});

test("deepClone handles Maps", () => {
  const map = new Map([["a", 1], ["b", { c: 2 }]]);
  const cloned = deepClone(map);
  assert.notEqual(cloned, map);
  assert.equal(cloned.size, map.size);
  assert.equal(cloned.get("a"), map.get("a"));
  assert.notEqual(cloned.get("b"), map.get("b"));
  assert.deepEqual(cloned.get("b"), map.get("b"));
});

test("deepClone handles Sets", () => {
  const set = new Set([1, 2, { a: 3 }]);
  const cloned = deepClone(set);
  assert.notEqual(cloned, set);
  assert.equal(cloned.size, set.size);
  assert.equal([...cloned].length, [...set].length);
});

test("deepClone handles Buffers", () => {
  const buffer = Buffer.from("test");
  const cloned = deepClone(buffer);
  assert.notEqual(cloned, buffer);
  assert.equal(cloned.toString(), buffer.toString());
  assert.equal(Buffer.isBuffer(cloned), true);
});

test("deepClone throws on functions", () => {
  const fn = () => {};
  assert.throws(() => deepClone(fn), TypeError);
});

test("deepClone throws on class instances with circular references", () => {
  class TestClass {
    constructor() {
      this.self = this;
    }
  }
  const instance = new TestClass();
  // This will throw due to circular reference
  assert.throws(() => deepClone(instance));
});

test("canDeepClone returns true for clonable values", () => {
  assert.equal(canDeepClone({ a: 1 }), true);
  assert.equal(canDeepClone([1, 2, 3]), true);
  assert.equal(canDeepClone(new Date()), true);
  assert.equal(canDeepClone(new Map()), true);
  assert.equal(canDeepClone(new Set()), true);
  assert.equal(canDeepClone(Buffer.from("test")), true);
  assert.equal(canDeepClone(null), true);
  assert.equal(canDeepClone(undefined), true);
  assert.equal(canDeepClone(42), true);
});

test("canDeepClone returns false for non-clonable values", () => {
  assert.equal(canDeepClone(() => {}), false);
});

test("deepClone handles nested structures", () => {
  const nested = {
    a: [1, 2, { b: 3 }],
    c: new Map([["d", [4, 5]]]),
    e: { f: new Date("2024-01-01") }
  };
  const cloned = deepClone(nested);
  assert.notEqual(cloned, nested);
  assert.notEqual(cloned.a, nested.a);
  assert.notEqual(cloned.a[2], nested.a[2]);
  assert.notEqual(cloned.c, nested.c);
  assert.notEqual(cloned.e, nested.e);
  assert.notEqual(cloned.e.f, nested.e.f);
  assert.deepEqual(cloned, nested);
});
