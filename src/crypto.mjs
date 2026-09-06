/**
 * Crypto utilities module
 * Centralized cryptographic hash functions for the get-owncloud project
 * Issue #41: Consolidate duplicate crypto hash implementations
 */

import { createHash } from "node:crypto";

/**
 * Calculate SHA-256 hash of a string
 * Uses Node.js createHash for consistent behavior across all environments
 * @param {string} data - The string to hash
 * @returns {Promise<string>} Hex-encoded SHA-256 hash
 */
export async function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Calculate SHA-256 hash of a Buffer or Uint8Array
 * @param {Buffer|Uint8Array} data - The binary data to hash
 * @returns {string} Hex-encoded SHA-256 hash
 */
export function sha256Binary(data) {
  return createHash("sha256").update(data).digest("hex");
}
