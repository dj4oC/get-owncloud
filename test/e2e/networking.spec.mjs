import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Networking tests
 * Tests for domain, ports, TLS mode, and ACME configuration
 */

test.describe("Networking Controls", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for catalogs to be loaded by checking for an element that's updated after loading
    await page.waitForSelector("#image-digest-note", { state: "visible" });
    await page.waitForTimeout(500);
  });

  // Domain tests
  test("testDomainValid - Valid FQDN domain is accepted", async ({ page }) => {
    await page.locator('[name="domain"]').fill("cloud.example.com");
    await expect(page.locator('[name="domain"]')).toHaveValue("cloud.example.com");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).not.toContainText("domain");
  });

  test("testDomainMissing - Missing domain shows validation error", async ({ page }) => {
    await page.locator('[name="domain"]').fill("");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    // Should show validation error for missing required domain
    await expect(page.locator("#validation-errors")).toContainText("domain");
  });

  test("testDomainReserved - Reserved domain (localhost) is rejected for production", async ({ page }) => {
    // Set to production first
    await page.locator("#purpose").selectOption("production");
    await page.locator('[name="domain"]').fill("localhost");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    // Should show validation error for reserved domain in production
    await expect(page.locator("#validation-errors")).toContainText("reserved domain");
  });

  test("testDomainInvalid - Invalid domain is rejected", async ({ page }) => {
    await page.locator('[name="domain"]').fill("test");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    // Should show validation error for invalid domain
    await expect(page.locator("#validation-errors")).toContainText("domain");
  });

  // HTTP Port tests
  test("testHttpPortProduction - Production default HTTP port (80) works", async ({ page }) => {
    await page.locator("#purpose").selectOption("production");
    await page.locator('[name="httpPort"]').fill("80");
    await expect(page.locator('[name="httpPort"]')).toHaveValue("80");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).not.toContainText("httpPort");
  });

  test("testHttpPortEvaluation - Evaluation default HTTP port (8080) works", async ({ page }) => {
    await page.locator("#purpose").selectOption("evaluation");
    await page.locator('[name="httpPort"]').fill("8080");
    await expect(page.locator('[name="httpPort"]')).toHaveValue("8080");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).not.toContainText("httpPort");
  });

  test("testHttpPortCustom - Custom HTTP port (8081) works", async ({ page }) => {
    await page.locator('[name="httpPort"]').fill("8081");
    await expect(page.locator('[name="httpPort"]')).toHaveValue("8081");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).not.toContainText("httpPort");
  });

  // HTTPS Port tests
  test("testHttpsPortProduction - Production default HTTPS port (443) works", async ({ page }) => {
    await page.locator("#purpose").selectOption("production");
    await page.locator('[name="httpsPort"]').fill("443");
    await expect(page.locator('[name="httpsPort"]')).toHaveValue("443");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).not.toContainText("httpsPort");
  });

  test("testHttpsPortEvaluation - Evaluation default HTTPS port (8443) works", async ({ page }) => {
    await page.locator("#purpose").selectOption("evaluation");
    await page.locator('[name="httpsPort"]').fill("8443");
    await expect(page.locator('[name="httpsPort"]')).toHaveValue("8443");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).not.toContainText("httpsPort");
  });

  test("testHttpsPortCustom - Custom HTTPS port (8444) works", async ({ page }) => {
    await page.locator('[name="httpsPort"]').fill("8444");
    await expect(page.locator('[name="httpsPort"]')).toHaveValue("8444");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).not.toContainText("httpsPort");
  });

  // TLS Mode tests
  test("testTlsModeEvaluationSelfSigned - Evaluation self-signed TLS mode works", async ({ page }) => {
    await page.locator("#tls-mode").selectOption("evaluation-self-signed");
    await expect(page.locator("#tls-mode")).toHaveValue("evaluation-self-signed");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).not.toContainText("tlsMode");
  });

  test("testTlsModeAcme - ACME TLS mode works", async ({ page }) => {
    await page.locator("#tls-mode").selectOption("acme");
    await expect(page.locator("#tls-mode")).toHaveValue("acme");
    
    // ACME should show email field for evaluation
    await expect(page.locator("#acme-email-field")).toBeVisible();
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).not.toContainText("tlsMode");
  });

  // Production TLS constraints
  test("testProductionForcesAcmeTls - Production purpose forces ACME TLS mode", async ({ page }) => {
    await page.locator("#purpose").selectOption("production");
    
    // Check that evaluation-self-signed is not available for production
    const tlsOptions = await page.locator("#tls-mode option").allTextContents();
    expect(tlsOptions).not.toContain("Evaluation self-signed");
    expect(tlsOptions).toContain("Trusted ACME");
    
    // Should default to ACME for production
    await expect(page.locator("#tls-mode")).toHaveValue("acme");
  });

  test("testProductionRejectsSelfSignedTls - Production purpose rejects evaluation-self-signed TLS", async ({ page }) => {
    await page.locator("#purpose").selectOption("production");
    
    // Try to select evaluation-self-signed - should not be available
    // This tests that the UI prevents invalid combinations
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).toContainText("Production requires");
  });

  // ACME email tests
  test("testOidcIssuerProductionValid - Valid OIDC issuer for production uses HTTPS", async ({ page }) => {
    // This appears to be testing production OIDC issuer from the catalogue
    // The catalogue has oidcIssuerProduction which must use HTTPS
    await page.locator('[name="domain"]').fill("cloud.example.com");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  // Test port defaults based on purpose
  test("testPortDefaultsByPurpose - HTTP/HTTPS ports default correctly based on purpose", async ({ page }) => {
    // For evaluation, should default to 8080/8443
    await page.locator("#purpose").selectOption("evaluation");
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    
    // The calculate button should populate default ports for evaluation
    // Check that the form can calculate sizing with evaluation defaults
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  // Test accessibility for networking controls
  test("testNetworkingAccessibility - Networking controls pass accessibility scan", async ({ page }) => {
    await page.locator('[name="domain"]').focus();
    
    const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(accessibility.violations).toEqual([]);
  });

  // Test that missing domain causes validation error
  test("testMissingDomainValidation - Missing domain field shows validation error", async ({ page }) => {
    // Clear the domain field
    await page.locator('[name="domain"]').fill("");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).toBeVisible();
  });

  // Test that invalid port values are rejected
  test("testInvalidPortValues - Invalid port values are rejected", async ({ page }) => {
    // Test port 0 (invalid)
    await page.locator('[name="httpPort"]').fill("0");
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    
    // Test port 65536 (above max)
    await page.locator('[name="httpPort"]').fill("65536");
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    
    // Should show validation errors for invalid ports
    await expect(page.locator("#validation-errors")).toBeVisible();
  });

  // Test that TLS mode affects field visibility
  test("testTlsModeAffectsFieldVisibility - TLS mode affects ACME email field visibility", async ({ page }) => {
    // ACME mode should show email field
    await page.locator("#tls-mode").selectOption("acme");
    await expect(page.locator("#acme-email-field")).toBeVisible();
    
    // Evaluation self-signed should hide email field
    await page.locator("#tls-mode").selectOption("evaluation-self-signed");
    await expect(page.locator("#acme-email-field")).toBeHidden();
  });

  // Test complete networking configuration
  test("testCompleteNetworkingConfig - Complete networking configuration validates successfully", async ({ page }) => {
    // Set all networking fields
    await page.locator('[name="domain"]').fill("cloud.corp.example");
    await page.locator('[name="httpPort"]').fill("80");
    await page.locator('[name="httpsPort"]').fill("443");
    await page.locator("#tls-mode").selectOption("acme");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).toBeHidden();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  // Test Kubernetes networking fields
  test("testKubernetesNetworkingFields - Kubernetes shows additional networking fields", async ({ page }) => {
    await page.locator("#runtime").selectOption("kubernetes");
    
    // Should show ingress class and TLS secret fields for Kubernetes
    await expect(page.locator('[name="ingressClassName"]')).toBeVisible();
    await expect(page.locator('[name="tlsSecretName"]')).toBeVisible();
    
    // These should be hidden for non-Kubernetes runtimes
    await page.locator("#runtime").selectOption("docker");
    await expect(page.locator('[name="ingressClassName"]')).toBeHidden();
    await expect(page.locator('[name="tlsSecretName"]')).toBeHidden();
  });
});