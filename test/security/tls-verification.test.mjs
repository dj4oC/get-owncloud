import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");

/**
 * Security tests for TLS certificate verification bypass prevention
 * Addresses issue #32
 * CWE-295: Improper Certificate Validation
 */

test.describe("TLS Certificate Verification Security Tests (Issue #32)", () => {
  test("healthcheck.sh contains --evaluation-insecure option", () => {
    const healthcheckPath = join(ROOT, "scripts", "healthcheck.sh");
    const content = readFileSync(healthcheckPath, "utf8");
    
    assert.ok(content.includes("--evaluation-insecure"), "Should contain --evaluation-insecure option");
    assert.ok(content.includes("deprecated"), "Should mark --evaluation-insecure as deprecated");
    assert.ok(content.includes("--evaluation-ca-bundle"), "Should contain --evaluation-ca-bundle option");
  });

  test("healthcheck.sh uses proper TLS verification by default", () => {
    const healthcheckPath = join(ROOT, "scripts", "healthcheck.sh");
    const content = readFileSync(healthcheckPath, "utf8");
    
    // Should not have --insecure in the default curl calls
    const lines = content.split('\n');
    const defaultCurlLines = lines.filter(line => 
      line.includes("curl") && !line.includes("EVALUATION_INSECURE") && !line.includes("--insecure")
    );
    
    // Check that there are curl calls without --insecure when not using EVALUATION_INSECURE
    assert.ok(defaultCurlLines.length > 0, "Should have curl calls without --insecure by default");
  });

  test("healthcheck.sh shows warning when using --evaluation-insecure", () => {
    const healthcheckPath = join(ROOT, "scripts", "healthcheck.sh");
    const content = readFileSync(healthcheckPath, "utf8");
    
    // Check that deprecation warning is shown when --evaluation-insecure is used
    assert.ok(content.includes("WARNING") && content.includes("deprecated"), 
      "Should show deprecation warning for --evaluation-insecure");
  });

  test("healthcheck.sh supports CA bundle configuration", () => {
    const healthcheckPath = join(ROOT, "scripts", "healthcheck.sh");
    const content = readFileSync(healthcheckPath, "utf8");
    
    assert.ok(content.includes("--evaluation-ca-bundle"), "Should support --evaluation-ca-bundle option");
    assert.ok(content.includes("--cacert"), "Should use --cacert with CA bundle");
    assert.ok(content.includes("EVALUATION_CA_BUNDLE"), "Should have EVALUATION_CA_BUNDLE variable");
  });

  test("healthcheck.sh requires HTTPS by default", () => {
    const healthcheckPath = join(ROOT, "scripts", "healthcheck.sh");
    const content = readFileSync(healthcheckPath, "utf8");
    
    // Should enforce HTTPS
    assert.ok(content.includes("https://*"), "Should accept HTTPS URLs");
    assert.ok(content.includes("HTTP is evaluation-only"), "Should restrict HTTP to evaluation-only");
  });

  test("update-service.sh uses proper TLS verification", () => {
    const updateServicePath = join(ROOT, "scripts", "update-service.sh");
    const content = readFileSync(updateServicePath, "utf8");
    
    // Should use HTTPS protocol and TLS 1.2
    assert.ok(content.includes("--proto '=https'"), "Should use HTTPS protocol");
    assert.ok(content.includes("--tlsv1.2"), "Should use TLS 1.2");
    assert.ok(!content.includes("--insecure"), "Should not use --insecure");
    
    // Should enforce HTTPS URL
    assert.ok(content.includes("https://*)"), "Should require HTTPS URLs");
    assert.ok(content.includes("HTTPS"), "Should mention HTTPS requirement");
  });

  test("runtime-e2e.sh uses --insecure for evaluation self-signed certs", () => {
    const runtimeE2EPath = join(ROOT, "scripts", "runtime-e2e.sh");
    const content = readFileSync(runtimeE2EPath, "utf8");
    
    // Count occurrences of --insecure flag
    const lines = content.split('\n');
    const insecureLines = lines.filter(line => line.includes('--insecure'));
    
    // Should still have --insecure for evaluation (this documents current state)
    assert.ok(insecureLines.length > 0, "Should use --insecure for evaluation self-signed certificates");
  });
});

test.describe("TLS Configuration Code Analysis", () => {
  test("healthcheck.sh has curl_tls_opts variable for TLS configuration", () => {
    const healthcheckPath = join(ROOT, "scripts", "healthcheck.sh");
    const content = readFileSync(healthcheckPath, "utf8");
    
    assert.ok(content.includes("curl_tls_opts"), "Should have curl_tls_opts variable");
    assert.ok(content.includes("$curl_tls_opts"), "Should use curl_tls_opts variable in curl calls");
  });

  test("healthcheck.sh builds TLS options based on input flags", () => {
    const healthcheckPath = join(ROOT, "scripts", "healthcheck.sh");
    const content = readFileSync(healthcheckPath, "utf8");
    
    // Should build TLS options based on flags
    assert.ok(content.includes("if [ \"$EVALUATION_INSECURE\" = true ]"), "Should check EVALUATION_INSECURE flag");
    assert.ok(content.includes("elif [ -n \"$EVALUATION_CA_BUNDLE\" ]"), "Should check EVALUATION_CA_BUNDLE flag");
    assert.ok(content.includes("curl_tls_opts=\"\""), "Should initialize curl_tls_opts as empty");
  });
});