import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");

/**
 * Security tests for path traversal vulnerabilities in shell scripts
 * Addresses issue #31
 * CWE-22: Improper Limitation of a Pathname to a Restricted Directory
 */

// Function to test the shell validation directly
function testShellValidation(configPath, dataPath, shouldPass) {
  const runtimeCommonPath = join(ROOT, "scripts", "runtime-common.sh");
  
  // Escape paths properly for shell
  const escapedConfig = configPath.replace(/'/g, "'\\''").replace(/"/g, '\\"');
  const escapedData = dataPath.replace(/'/g, "'\\''").replace(/"/g, '\\"');
  
  // Create a test script that calls the function
  const testScript = `
#!/bin/sh
. "${runtimeCommonPath}"

die() {
  echo "REJECTED"
  exit 1
}

# Test the function with provided paths
if get_owncloud_assert_storage_paths "${escapedConfig}" "${escapedData}" 2>/dev/null; then
  echo "ACCEPTED"
  exit 0
else
  echo "REJECTED"
  exit 1
fi
`;

  try {
    const result = execSync(testScript, {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 5000,
      shell: "/bin/sh"
    });
    
    const isAccepted = result.trim() === "ACCEPTED";
    return shouldPass ? isAccepted : !isAccepted;
  } catch (error) {
    // If we expect it to fail and it throws an error, that's correct
    return !shouldPass;
  }
}

test.describe("Shell Path Traversal Vulnerability - runtime-common.sh (Issue #31)", () => {
  test("rejects absolute path /etc/passwd for configPath", () => {
    const success = testShellValidation("/etc/passwd", "./data/config", false);
    assert.ok(success, "Should reject absolute path /etc/passwd for configPath");
  });

  test("rejects absolute path /var/lib/sensitive for configPath", () => {
    const success = testShellValidation("/var/lib/sensitive", "./data/config", false);
    assert.ok(success, "Should reject absolute path /var/lib/sensitive for configPath");
  });

  test("rejects absolute path /etc/passwd for dataPath", () => {
    const success = testShellValidation("./data/config", "/etc/passwd", false);
    assert.ok(success, "Should reject absolute path /etc/passwd for dataPath");
  });

  test("rejects root path / for configPath", () => {
    const success = testShellValidation("/", "./data/config", false);
    assert.ok(success, "Should reject root path / for configPath");
  });

  test("rejects path traversal ../etc for configPath", () => {
    const success = testShellValidation("../etc", "./data/config", false);
    assert.ok(success, "Should reject path traversal ../etc for configPath");
  });

  test("rejects path traversal foo/../etc for configPath", () => {
    const success = testShellValidation("foo/../etc", "./data/config", false);
    assert.ok(success, "Should reject path traversal foo/../etc for configPath");
  });

  test("rejects nested path traversal foo/bar/../../etc for configPath", () => {
    const success = testShellValidation("foo/bar/../../etc", "./data/config", false);
    assert.ok(success, "Should reject nested path traversal foo/bar/../../etc for configPath");
  });

  test("rejects absolute path / for dataPath", () => {
    const success = testShellValidation("./data/config", "/", false);
    assert.ok(success, "Should reject root path / for dataPath");
  });

  test("rejects dot path . for configPath", () => {
    const success = testShellValidation(".", "./data/config", false);
    assert.ok(success, "Should reject dot path . for configPath");
  });

  test("rejects double dot path .. for configPath", () => {
    const success = testShellValidation("..", "./data/config", false);
    assert.ok(success, "Should reject double dot path .. for configPath");
  });

  test("rejects empty configPath", () => {
    const success = testShellValidation("", "./data/config", false);
    assert.ok(success, "Should reject empty configPath");
  });

  test("rejects empty dataPath", () => {
    const success = testShellValidation("./data/config", "", false);
    assert.ok(success, "Should reject empty dataPath");
  });

  test("accepts relative path ./data/data for configPath", () => {
    const success = testShellValidation("./data/data", "./data/config", true);
    assert.ok(success, "Should accept relative path ./data/data for configPath");
  });

  test("accepts relative path data/config for configPath", () => {
    const success = testShellValidation("data/config", "./data/data", true);
    assert.ok(success, "Should accept relative path data/config for configPath");
  });

  test("accepts relative path my-volumes/data for configPath", () => {
    const success = testShellValidation("my-volumes/data", "my-volumes/config", true);
    assert.ok(success, "Should accept relative path my-volumes/data for configPath");
  });

  test("accepts relative paths with nested structure", () => {
    const success = testShellValidation("./volumes/app/data", "./volumes/app/config", true);
    assert.ok(success, "Should accept relative paths with nested structure");
  });

  test("rejects identical configPath and dataPath", () => {
    const success = testShellValidation("./data", "./data", false);
    assert.ok(success, "Should reject identical configPath and dataPath");
  });

  test("rejects nested paths where config is inside data", () => {
    const success = testShellValidation("./data/config", "./data", false);
    assert.ok(success, "Should reject nested paths where config is inside data");
  });

  test("rejects nested paths where data is inside config", () => {
    const success = testShellValidation("./data", "./data/config", false);
    assert.ok(success, "Should reject nested paths where data is inside config");
  });
});

test.describe("Shell Path Traversal Edge Cases", () => {
  test("rejects absolute paths with multiple leading slashes", () => {
    const success = testShellValidation("//etc/passwd", "./data/config", false);
    assert.ok(success, "Should reject absolute paths with multiple leading slashes");
  });

  test("rejects path traversal with leading ./../", () => {
    const success = testShellValidation("./../etc", "./data/config", false);
    assert.ok(success, "Should reject path traversal with leading ./../");
  });

  test("rejects path traversal with .. in middle", () => {
    const success = testShellValidation("data/../config", "./data/config", false);
    assert.ok(success, "Should reject path traversal with .. in middle");
  });

  test("accepts relative path with dots but no traversal", () => {
    const success = testShellValidation("./data.backup/config", "./data.backup/data", true);
    assert.ok(success, "Should accept relative path with dots but no traversal");
  });

  test("rejects absolute path /var/lib", () => {
    const success = testShellValidation("/var/lib", "./data/config", false);
    assert.ok(success, "Should reject absolute path /var/lib");
  });

  test("rejects absolute path /home/user/data", () => {
    const success = testShellValidation("/home/user/data", "./data/config", false);
    assert.ok(success, "Should reject absolute path /home/user/data");
  });
});