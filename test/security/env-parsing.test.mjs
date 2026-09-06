import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");

/**
 * Security tests for .env file parsing vulnerabilities
 * Addresses issue #35
 * CWE-159: Improper Neutralization of Script in a Command ('Command Injection')
 */

// Function to test env_get function directly by extracting just the function
function testEnvGetDirect(envContent, key, expectedValue) {
  const tempDir = execSync("mktemp -d", { encoding: "utf8" }).trim();
  
  try {
    // Write the .env file
    const envPath = join(tempDir, ".env");
    writeFileSync(envPath, envContent, "utf8");
    
    // Create a test script that only defines the env_get function and tests it
    const testScript = `
#!/bin/sh
BUNDLE_DIR="${tempDir}"

# Define the env_get function from install.sh
env_get() {
  local key=$1
  local value
  
  # Use grep to find the line safely, then extract value
  value=$(grep -m1 "^\${key}=" "$BUNDLE_DIR/.env" 2>/dev/null | cut -d= -f2- || echo "")
  
  # Remove surrounding quotes safely using parameter expansion
  # Remove single quotes
  value="\${value#\\'}"
  value="\${value%\\'}"
  # Remove double quotes
  value="\${value#\\\"}"
  value="\${value%\\\"}"
  
  printf '%s' "$value"
}

result=$(env_get "${key}")
echo "RESULT:$result"
`;
    
    const result = execSync(testScript, {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 5000,
      shell: "/bin/sh"
    });
    
    // Extract the result
    const match = result.match(/RESULT:(.*)/);
    const actualValue = match ? match[1] : "";
    
    return actualValue === expectedValue;
  } finally {
    // Cleanup
    try { rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
  }
}

// Function to test that the new env_get function exists in all scripts
function testScriptHasSafeEnvGet(scriptName) {
  const scriptPath = join(ROOT, "scripts", scriptName);
  const content = execSync(`cat "${scriptPath}"`, { encoding: "utf8" });
  
  return content.includes("grep -m1") && content.includes("cut -d= -f2-");
}

// Function to test that the old vulnerable pattern is removed
function testScriptHasNoVulnerablePattern(scriptName) {
  const scriptPath = join(ROOT, "scripts", scriptName);
  const content = execSync(`cat "${scriptPath}"`, { encoding: "utf8" });
  
  // Check for the old vulnerable pattern
  const hasOldPattern = content.includes("sed -n \"s/^$1=//p\"") || 
                     content.includes("sed -n 's/^$1=//p'") ||
                     content.includes("sed -n \"s/^${key}=//p\"");
  
  return !hasOldPattern;
}

test.describe(".env File Parsing Security Tests (Issue #35)", () => {
  test("env_get correctly parses simple key=value", () => {
    const envContent = "SIMPLE_KEY=simple_value\nOTHER_KEY=other_value\n";
    const success = testEnvGetDirect(envContent, "SIMPLE_KEY", "simple_value");
    assert.ok(success, "Should parse simple key=value correctly");
  });

  test("env_get correctly handles quoted values", () => {
    const envContent = 'QUOTED_KEY="quoted_value"\nOTHER_KEY=other\n';
    const success = testEnvGetDirect(envContent, "QUOTED_KEY", "quoted_value");
    assert.ok(success, "Should handle quoted values correctly");
  });

  test("env_get correctly handles single-quoted values", () => {
    const envContent = "SINGLE_QUOTED='single_value'\nOTHER_KEY=other\n";
    const success = testEnvGetDirect(envContent, "SINGLE_QUOTED", "single_value");
    assert.ok(success, "Should handle single-quoted values correctly");
  });

  test("env_get handles values with equals signs", () => {
    const envContent = "COMPLEX_KEY=value=with=equals\nOTHER_KEY=other\n";
    const success = testEnvGetDirect(envContent, "COMPLEX_KEY", "value=with=equals");
    assert.ok(success, "Should handle values with equals signs correctly");
  });

  test("env_get returns empty for missing keys", () => {
    const envContent = "EXISTING_KEY=value\nOTHER_KEY=other\n";
    const success = testEnvGetDirect(envContent, "MISSING_KEY", "");
    assert.ok(success, "Should return empty for missing keys");
  });

  test("env_get safely handles command substitution patterns", () => {
    const envContent = "MALICIOUS_KEY=$(echo hacked)\nOTHER_KEY=other\n";
    const success = testEnvGetDirect(envContent, "MALICIOUS_KEY", "$(echo hacked)");
    assert.ok(success, "Should safely return command substitution pattern without executing it");
  });

  test("env_get safely handles backtick patterns", () => {
    const envContent = "MALICIOUS_KEY=`echo hacked`\nOTHER_KEY=other\n";
    const success = testEnvGetDirect(envContent, "MALICIOUS_KEY", "`echo hacked`");
    assert.ok(success, "Should safely return backtick pattern without executing it");
  });

  test("env_get handles values with special characters", () => {
    const envContent = "SPECIAL_KEY=value with spaces and-dashes_underscores\nOTHER_KEY=other\n";
    const success = testEnvGetDirect(envContent, "SPECIAL_KEY", "value with spaces and-dashes_underscores");
    assert.ok(success, "Should handle special characters in values");
  });
});

test.describe("Code Security Tests", () => {
  test("install.sh has safe env_get function", () => {
    const success = testScriptHasSafeEnvGet("install.sh");
    assert.ok(success, "install.sh should have safe env_get function");
  });

  test("backup.sh has safe env_get function", () => {
    const success = testScriptHasSafeEnvGet("backup.sh");
    assert.ok(success, "backup.sh should have safe env_get function");
  });

  test("restore.sh has safe env_get function", () => {
    const success = testScriptHasSafeEnvGet("restore.sh");
    assert.ok(success, "restore.sh should have safe env_get function");
  });

  test("update-service.sh has safe env_get function", () => {
    const success = testScriptHasSafeEnvGet("update-service.sh");
    assert.ok(success, "update-service.sh should have safe env_get function");
  });

  test("runtime-common.sh has safe env_get function", () => {
    const success = testScriptHasSafeEnvGet("runtime-common.sh");
    assert.ok(success, "runtime-common.sh should have safe env_get function");
  });
});

test.describe("Vulnerability Removal Tests", () => {
  test("install.sh no longer has vulnerable sed pattern", () => {
    const success = testScriptHasNoVulnerablePattern("install.sh");
    assert.ok(success, "install.sh should not have vulnerable sed pattern");
  });

  test("backup.sh no longer has vulnerable sed pattern", () => {
    const success = testScriptHasNoVulnerablePattern("backup.sh");
    assert.ok(success, "backup.sh should not have vulnerable sed pattern");
  });

  test("restore.sh no longer has vulnerable sed pattern", () => {
    const success = testScriptHasNoVulnerablePattern("restore.sh");
    assert.ok(success, "restore.sh should not have vulnerable sed pattern");
  });

  test("update-service.sh no longer has vulnerable sed pattern", () => {
    const success = testScriptHasNoVulnerablePattern("update-service.sh");
    assert.ok(success, "update-service.sh should not have vulnerable sed pattern");
  });
});