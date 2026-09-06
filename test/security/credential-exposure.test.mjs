import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");

/**
 * Security tests for credential exposure prevention
 * Addresses issue #33
 * CWE-532: Insertion of Sensitive Information into Log File
 */

test.describe("Credential Exposure Security Tests (Issue #33)", () => {
  test("runtime-e2e.sh uses --netrc-file instead of -u flag", () => {
    const runtimeE2EPath = join(ROOT, "scripts", "runtime-e2e.sh");
    const content = readFileSync(runtimeE2EPath, "utf8");
    
    // Should use --netrc-file instead of -u flag
    assert.ok(content.includes("--netrc-file"), "Should use --netrc-file for credentials");
    
    // Should not use -u flag with admin password
    const lines = content.split('\n');
    const unsafeLines = lines.filter(line => line.includes("-u") && line.includes("ADMIN_PASSWORD"));
    assert.equal(unsafeLines.length, 0, "Should not use -u flag with ADMIN_PASSWORD");
  });

  test("runtime-e2e.sh creates .netrc file", () => {
    const runtimeE2EPath = join(ROOT, "scripts", "runtime-e2e.sh");
    const content = readFileSync(runtimeE2EPath, "utf8");
    
    assert.ok(content.includes("NETRC_FILE"), "Should define NETRC_FILE variable");
    assert.ok(content.includes("printf 'machine"), "Should create .netrc file with machine entry");
    assert.ok(content.includes("login admin"), "Should include login admin in .netrc");
    assert.ok(content.includes("password"), "Should include password in .netrc");
  });

  test("runtime-e2e.sh secures .netrc file permissions", () => {
    const runtimeE2EPath = join(ROOT, "scripts", "runtime-e2e.sh");
    const content = readFileSync(runtimeE2EPath, "utf8");
    
    assert.ok(content.includes("chmod 600"), "Should set restrictive permissions (600) on .netrc file");
    assert.ok(content.includes("\"$NETRC_FILE\""), "Should apply permissions to NETRC_FILE");
  });

  test("runtime-e2e.sh cleans up .netrc file securely", () => {
    const runtimeE2EPath = join(ROOT, "scripts", "runtime-e2e.sh");
    const content = readFileSync(runtimeE2EPath, "utf8");
    
    assert.ok(content.includes("shred -u"), "Should use shred to securely delete .netrc file");
    assert.ok(content.includes("rm -f"), "Should have fallback rm -f for .netrc file");
  });

  test("runtime-e2e.sh still extracts ADMIN_PASSWORD but uses it securely", () => {
    const runtimeE2EPath = join(ROOT, "scripts", "runtime-e2e.sh");
    const content = readFileSync(runtimeE2EPath, "utf8");
    
    // Should still extract the password for .netrc file creation
    assert.ok(content.includes("ADMIN_PASSWORD="), "Should still extract ADMIN_PASSWORD");
    assert.ok(content.includes("e2e-secrets.json"), "Should read from e2e-secrets.json");
    
    // But should not pass it directly to curl -u
    const lines = content.split('\n');
    const unsafeCurlLines = lines.filter(line => 
      line.includes("curl") && line.includes("-u") && line.includes("ADMIN_PASSWORD")
    );
    assert.equal(unsafeCurlLines.length, 0, "Should not pass ADMIN_PASSWORD to curl -u flag");
  });

  test(".netrc file is created before first curl call", () => {
    const runtimeE2EPath = join(ROOT, "scripts", "runtime-e2e.sh");
    const content = readFileSync(runtimeE2EPath, "utf8");
    
    // Find positions of .netrc creation and first curl call
    const lines = content.split('\n');
    let netrcLine = -1;
    let firstCurlWithNetrc = -1;
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("NETRC_FILE=") && netrcLine === -1) {
        netrcLine = i;
      }
      if (lines[i].includes("--netrc-file") && firstCurlWithNetrc === -1) {
        firstCurlWithNetrc = i;
      }
    }
    
    assert.ok(netrcLine !== -1, "Should have NETRC_FILE definition");
    assert.ok(firstCurlWithNetrc !== -1, "Should have curl with --netrc-file");
    assert.ok(netrcLine < firstCurlWithNetrc, "NETRC_FILE should be defined before first curl call");
  });

  test("all curl calls with admin credentials use --netrc-file", () => {
    const runtimeE2EPath = join(ROOT, "scripts", "runtime-e2e.sh");
    const content = readFileSync(runtimeE2EPath, "utf8");
    
    const lines = content.split('\n');
    const curlLines = lines.filter(line => line.includes("curl") && line.includes("admin"));
    
    for (const curlLine of curlLines) {
      // All curl lines that mention admin should use --netrc-file
      assert.ok(curlLine.includes("--netrc-file"), 
        `Curl line should use --netrc-file: ${curlLine}`);
      // None should use -u with admin
      assert.ok(!curlLine.includes("-u") || !curlLine.includes("admin"), 
        `Curl line should not use -u with admin: ${curlLine}`);
    }
  });
});

test.describe("Credential Exposure Code Analysis", () => {
  test("runtime-e2e.sh contains .netrc cleanup in cleanup function", () => {
    const runtimeE2EPath = join(ROOT, "scripts", "runtime-e2e.sh");
    const content = readFileSync(runtimeE2EPath, "utf8");
    
    // Find cleanup function - look for the section between cleanup() { and the closing }
    const lines = content.split('\n');
    let inCleanup = false;
    let cleanupContent = "";
    let braceCount = 0;
    
    for (const line of lines) {
      if (line.includes("cleanup() {")) {
        inCleanup = true;
        cleanupContent += line + "\n";
        continue;
      }
      if (inCleanup) {
        cleanupContent += line + "\n";
        // Count braces to handle nested blocks
        if (line.includes("{")) braceCount++;
        if (line.includes("}")) {
          if (braceCount === 0) {
            break;
          } else {
            braceCount--;
          }
        }
      }
    }
    
    assert.ok(cleanupContent.length > 0, "Should have cleanup function content");
    assert.ok(cleanupContent.includes(".netrc"), "Cleanup function should handle .netrc file");
    assert.ok(cleanupContent.includes("shred") || cleanupContent.includes("rm -f"), 
      "Cleanup function should securely delete .netrc file");
  });

  test("ADMIN_PASSWORD extraction is preserved", () => {
    const runtimeE2EPath = join(ROOT, "scripts", "runtime-e2e.sh");
    const content = readFileSync(runtimeE2EPath, "utf8");
    
    // Should still extract the password
    assert.ok(content.includes("ADMIN_PASSWORD="), "Should extract ADMIN_PASSWORD");
    assert.ok(content.includes("adminPassword"), "Should read adminPassword from secrets file");
    assert.ok(content.includes("e2e-secrets.json"), "Should use e2e-secrets.json");
  });

  test("All credential-related curl calls use secure approach", () => {
    const runtimeE2EPath = join(ROOT, "scripts", "runtime-e2e.sh");
    const content = readFileSync(runtimeE2EPath, "utf8");
    
    // Count occurrences of different credential approaches
    const lines = content.split('\n');
    let netrcCount = 0;
    let unsafeUserCount = 0;
    
    for (const line of lines) {
      if (line.includes("--netrc-file")) {
        netrcCount++;
      }
      if (line.includes("-u") && line.includes("admin") && line.includes("ADMIN_PASSWORD")) {
        unsafeUserCount++;
      }
    }
    
    assert.ok(netrcCount > 0, "Should have --netrc-file usage");
    assert.equal(unsafeUserCount, 0, "Should not have unsafe -u usage with admin and ADMIN_PASSWORD");
  });
});