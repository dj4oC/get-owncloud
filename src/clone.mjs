/**
 * Deep clone utilities
 * Issue #42: Replace structuredClone with robust deep clone implementation
 * 
 * structuredClone has limitations:
 * - Cannot clone functions, DOM nodes, or prototype chains
 * - Throws on non-clonable types instead of providing safe fallback
 * - Behavior may vary across JavaScript engines
 */

/**
 * Deep clone an object or value
 * Supports: primitives, arrays, plain objects, Dates, RegExps, Maps, Sets, Buffers
 * Does not support: functions, circular references, DOM nodes, prototype chains
 * 
 * @param {any} value - The value to clone
 * @returns {any} The cloned value
 * @throws {TypeError} If the value cannot be cloned
 */
export function deepClone(value) {
  // Handle primitives and null/undefined
  if (value === null || value === undefined) {
    return value;
  }

  // Handle primitives (numbers, strings, booleans, symbols, bigints)
  const type = typeof value;
  if (type !== "object" && type !== "function") {
    return value;
  }

  // Functions cannot be meaningfully cloned
  if (type === "function") {
    throw new TypeError(`Cannot deep clone functions (got ${value.constructor?.name || 'anonymous function'})`);
  }

  // Handle Date
  if (value instanceof Date) {
    return new Date(value.getTime());
  }

  // Handle RegExp
  if (value instanceof RegExp) {
    return new RegExp(value.source, value.flags);
  }

  // Handle Map
  if (value instanceof Map) {
    const cloned = new Map();
    for (const [key, val] of value.entries()) {
      cloned.set(deepClone(key), deepClone(val));
    }
    return cloned;
  }

  // Handle Set
  if (value instanceof Set) {
    const cloned = new Set();
    for (const val of value.values()) {
      cloned.add(deepClone(val));
    }
    return cloned;
  }

  // Handle Buffer
  if (Buffer.isBuffer(value)) {
    return Buffer.from(value);
  }

  // Handle Array
  if (Array.isArray(value)) {
    return value.map(item => deepClone(item));
  }

  // Handle plain objects
  if (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) {
    const cloned = {};
    for (const [key, val] of Object.entries(value)) {
      cloned[key] = deepClone(val);
    }
    return cloned;
  }

  // Handle objects with custom prototypes (attempt to preserve)
  try {
    const cloned = Object.create(Object.getPrototypeOf(value));
    for (const [key, val] of Object.entries(value)) {
      cloned[key] = deepClone(val);
    }
    return cloned;
  } catch {
    // Fallback to JSON serialization for complex objects
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (e) {
      throw new TypeError(
        `Cannot deep clone value of type ${typeof value} (constructor: ${value.constructor?.name || 'unknown'}). ` +
        `structuredClone may work for this type, but deepClone provides more predictable behavior. ` +
        `Error: ${e.message}`
      );
    }
  }
}

/**
 * Check if a value can be safely cloned with deepClone
 * @param {any} value - The value to check
 * @returns {boolean} True if the value can be cloned
 */
export function canDeepClone(value) {
  try {
    deepClone(value);
    return true;
  } catch {
    return false;
  }
}
