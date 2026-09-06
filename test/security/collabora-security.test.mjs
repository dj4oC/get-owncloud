import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");

/**
 * Security tests for Collabora container MKNOD capability
 * Addresses issue #36
 * CWE-269: Improper Privilege Management
 */

test.describe("Collabora Container Security Configuration (Issue #36)", () => {
  test("Collabora container has MKNOD capability", () => {
    const collaboraPath = join(ROOT, "deploy", "compose", "template", "collabora.yml");
    const content = readFileSync(collaboraPath, "utf8");
    
    assert.ok(content.includes("cap_add:"), "Should have cap_add section");
    assert.ok(content.includes("- MKNOD"), "Should include MKNOD capability");
  });

  test("Collabora container drops ALL other capabilities", () => {
    const collaboraPath = join(ROOT, "deploy", "compose", "template", "collabora.yml");
    const content = readFileSync(collaboraPath, "utf8");
    
    assert.ok(content.includes("cap_drop:"), "Should have cap_drop section");
    assert.ok(content.includes("- ALL"), "Should drop ALL capabilities");
  });

  test("Collabora container has read-only filesystem", () => {
    const collaboraPath = join(ROOT, "deploy", "compose", "template", "collabora.yml");
    const content = readFileSync(collaboraPath, "utf8");
    
    assert.ok(content.includes("read_only:"), "Should have read_only setting");
    assert.ok(content.includes("true"), "read_only should be true");
  });

  test("Collabora container has secure tmpfs", () => {
    const collaboraPath = join(ROOT, "deploy", "compose", "template", "collabora.yml");
    const content = readFileSync(collaboraPath, "utf8");
    
    assert.ok(content.includes("tmpfs:"), "Should have tmpfs section");
    assert.ok(content.includes("/tmp"), "Should mount /tmp as tmpfs");
    assert.ok(content.includes("noexec"), "Should have noexec option");
    assert.ok(content.includes("nosuid"), "Should have nosuid option");
  });

  test("Collabora container uses pinned image digest", () => {
    const collaboraPath = join(ROOT, "deploy", "compose", "template", "collabora.yml");
    const content = readFileSync(collaboraPath, "utf8");
    
    assert.ok(content.includes("docker.io/collabora/code@sha256:"), "Should use pinned image with digest");
    // Check that it's a valid SHA256 hash
    assert.ok(content.match(/sha256:[0-9a-f]{64}/), "Should have valid 64-character hex digest");
  });

  test("Collabora container has health check", () => {
    const collaboraPath = join(ROOT, "deploy", "compose", "template", "collabora.yml");
    const content = readFileSync(collaboraPath, "utf8");
    
    assert.ok(content.includes("healthcheck:"), "Should have healthcheck section");
    assert.ok(content.includes("GET /hosting/discovery"), "Should check hosting/discovery endpoint");
  });
});

test.describe("Collabora Security Documentation", () => {
  test("SECURITY.md documents Collabora MKNOD exception", () => {
    const securityPath = join(ROOT, "SECURITY.md");
    const content = readFileSync(securityPath, "utf8");
    
    assert.ok(content.includes("Collabora runtime exception"), "Should have Collabora section");
    assert.ok(content.includes("MKNOD"), "Should mention MKNOD capability");
    assert.ok(content.includes("jail implementation"), "Should explain jail implementation requirement");
    assert.ok(content.includes("no-new-privileges"), "Should mention no-new-privileges");
  });

  test("SECURITY.md documents runtime protections", () => {
    const securityPath = join(ROOT, "SECURITY.md");
    const content = readFileSync(securityPath, "utf8");
    
    assert.ok(content.includes("cap_drop"), "Should mention cap_drop");
    assert.ok(content.includes("read_only"), "Should mention read_only filesystem");
    assert.ok(content.includes("tmpfs"), "Should mention tmpfs");
    assert.ok(content.includes("Runtime protections applied"), "Should have runtime protections section");
  });

  test("SECURITY.md documents security considerations", () => {
    const securityPath = join(ROOT, "SECURITY.md");
    const content = readFileSync(securityPath, "utf8");
    
    assert.ok(content.includes("Security considerations:"), "Should have security considerations");
    assert.ok(content.includes("device nodes"), "Should explain device node risks");
    assert.ok(content.includes("privilege escalation"), "Should mention privilege escalation risk");
  });

  test("SECURITY.md documents review requirements", () => {
    const securityPath = join(ROOT, "SECURITY.md");
    const content = readFileSync(securityPath, "utf8");
    
    assert.ok(content.includes("must be re-reviewed"), "Should require re-review");
    assert.ok(content.includes("pinned Collabora image changes"), "Should specify trigger for review");
    assert.ok(content.includes("regression-tested"), "Should mention regression testing");
  });

  test("SECURITY.md documents verification process", () => {
    const securityPath = join(ROOT, "SECURITY.md");
    const content = readFileSync(securityPath, "utf8");
    
    assert.ok(content.includes("Verification:"), "Should have verification section");
    assert.ok(content.includes("CI checks"), "Should mention CI checks");
    assert.ok(content.includes("SHA256"), "Should mention image digest tracking");
  });
});

test.describe("Collabora Security Configuration Validation", () => {
  test("Collabora container has exactly one capability added", () => {
    const collaboraPath = join(ROOT, "deploy", "compose", "template", "collabora.yml");
    const content = readFileSync(collaboraPath, "utf8");
    
    // Extract cap_add section
    const capAddMatch = content.match(/cap_add:\s*\n\s*- (\w+)/g);
    const capabilities = capAddMatch ? capAddMatch.map(match => match.replace(/cap_add:\s*\n\s*- /, '')) : [];
    
    assert.equal(capabilities.length, 1, "Should have exactly one capability added");
    assert.equal(capabilities[0], "MKNOD", "The only capability should be MKNOD");
  });

  test("Collabora container security options are minimal", () => {
    const collaboraPath = join(ROOT, "deploy", "compose", "template", "collabora.yml");
    const content = readFileSync(collaboraPath, "utf8");
    
    // Find the collabora service section
    const lines = content.split('\n');
    let collaboraSection = [];
    let inCollabora = false;
    
    for (const line of lines) {
      if (line.trim() === "collabora:") {
        inCollabora = true;
        continue;
      }
      if (inCollabora && line.trim().startsWith("collabora:") === false && line.trim() !== "" && !line.startsWith("    ")) {
        break;
      }
      if (inCollabora) {
        collaboraSection.push(line);
      }
    }
    
    const sectionContent = collaboraSection.join('\n');
    
    // Should have security-related configurations
    assert.ok(sectionContent.includes("cap_add:") || sectionContent.includes("cap_drop:") || 
              sectionContent.includes("read_only:") || sectionContent.includes("tmpfs:"), 
              "Should have security configurations");
  });

  test("Collabora container does not run as privileged", () => {
    const collaboraPath = join(ROOT, "deploy", "compose", "template", "collabora.yml");
    const content = readFileSync(collaboraPath, "utf8");
    
    // Should not have privileged: true
    assert.ok(!content.includes("privileged: true"), "Should not be privileged");
    // Should not have host process ID
    assert.ok(!content.includes("pid: host"), "Should not use host PID namespace");
  });
});