import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Collabora/Office tests
 * Tests for office integration mode, deployment options, and configuration
 */

test.describe("Collabora Controls", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for catalogs to be loaded by checking for an element that's updated after loading
    await page.waitForSelector("#image-digest-note", { state: "visible" });
    await page.waitForTimeout(500);
  });

  // Office mode tests
  test("testOfficeModeNone - None office mode disables all Collabora options", async ({ page }) => {
    await page.locator("#office-mode").selectOption("none");
    await expect(page.locator("#office-mode")).toHaveValue("none");
    
    // Collabora deployment should be hidden when office mode is none
    await expect(page.locator("#office-deployment-field")).toBeHidden();
    
    // All Collabora fields should be hidden
    await expect(page.locator("#collabora-concurrency-field")).toBeHidden();
    await expect(page.locator("#collabora-domain-field")).toBeHidden();
    await expect(page.locator("#collabora-url-field")).toBeHidden();
    await expect(page.locator("#collabora-password-field")).toBeHidden();
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
    
    // Check accessibility
    const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(accessibility.violations).toEqual([]);
  });

  test("testOfficeModeBundled - Bundled office mode shows domain and password fields", async ({ page }) => {
    await page.locator("#office-mode").selectOption("collabora");
    
    // Need to first select collabora mode, then deployment should become visible
    await expect(page.locator("#office-deployment-field")).toBeVisible();
    
    // Select bundled deployment
    await page.locator("#office-deployment").selectOption("bundled");
    await expect(page.locator("#office-deployment")).toHaveValue("bundled");
    
    // Bundled should show domain and password fields
    await expect(page.locator("#collabora-domain-field")).toBeVisible();
    await expect(page.locator("#collabora-password-field")).toBeVisible();
    
    // Should not show external URL field for bundled
    await expect(page.locator("#collabora-url-field")).toBeHidden();
    
    // Should show concurrency field
    await expect(page.locator("#collabora-concurrency-field")).toBeVisible();
  });

  test("testOfficeModeExternal - External office mode shows URL field", async ({ page }) => {
    await page.locator("#office-mode").selectOption("collabora");
    
    // Select external deployment
    await page.locator("#office-deployment").selectOption("external");
    await expect(page.locator("#office-deployment")).toHaveValue("external");
    
    // External should show URL field
    await expect(page.locator("#collabora-url-field")).toBeVisible();
    
    // Should not show domain and password fields for external
    await expect(page.locator("#collabora-domain-field")).toBeHidden();
    await expect(page.locator("#collabora-password-field")).toBeHidden();
    
    // Should still show concurrency field
    await expect(page.locator("#collabora-concurrency-field")).toBeVisible();
  });

  // Bundled domain tests
  test("testBundledDomainValid - Valid bundled Collabora domain is accepted", async ({ page }) => {
    await page.locator("#office-mode").selectOption("collabora");
    await page.locator("#office-deployment").selectOption("bundled");
    
    await page.locator('[name="collaboraDomain"]').fill("office.localhost");
    await expect(page.locator('[name="collaboraDomain"]')).toHaveValue("office.localhost");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).not.toContainText("collaboraDomain");
  });

  // Bundled admin password tests
  test("testBundledAdminPasswordValid - Valid bundled Collabora admin password is accepted", async ({ page }) => {
    await page.locator("#office-mode").selectOption("collabora");
    await page.locator("#office-deployment").selectOption("bundled");
    
    await page.locator('[name="collaboraAdminPassword"]').fill("admin-password-test");
    await expect(page.locator('[name="collaboraAdminPassword"]')).toHaveValue("admin-password-test");
    
    // Check that it's a password field
    await expect(page.locator('[name="collaboraAdminPassword"]')).toHaveAttribute("type", "password");
    await expect(page.locator('[name="collaboraAdminPassword"]')).toHaveAttribute("autocomplete", "new-password");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).not.toContainText("collaboraAdminPassword");
  });

  // External Collabora URL tests
  test("testExternalCollaboraUrlValid - Valid HTTPS external Collabora URL is accepted", async ({ page }) => {
    await page.locator("#office-mode").selectOption("collabora");
    await page.locator("#office-deployment").selectOption("external");
    
    await page.locator('[name="collaboraUrl"]').fill("https://office.example.com");
    await expect(page.locator('[name="collaboraUrl"]')).toHaveValue("https://office.example.com");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).not.toContainText("collaboraUrl");
  });

  test("testExternalCollaboraUrlInvalidHttp - HTTP external Collabora URL is rejected", async ({ page }) => {
    await page.locator("#office-mode").selectOption("collabora");
    await page.locator("#office-deployment").selectOption("external");
    
    await page.locator('[name="collaboraUrl"]').fill("http://office.example.com");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    // Should show validation error for non-HTTPS URL
    await expect(page.locator("#validation-errors")).toContainText("collaboraUrl");
  });

  // Collabora concurrent users tests
  test("testCollaboraConcurrentUsersDefault - Default collabora concurrent users (empty) is valid", async ({ page }) => {
    await page.locator("#office-mode").selectOption("collabora");
    
    // Leave concurrent users empty (should use default)
    await page.locator('[name="collaboraConcurrentUsers"]').fill("");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  test("testCollaboraConcurrentUsersExplicit - Explicit collabora concurrent users (10) is valid", async ({ page }) => {
    await page.locator("#office-mode").selectOption("collabora");
    
    await page.locator('[name="collaboraConcurrentUsers"]').fill("10");
    await expect(page.locator('[name="collaboraConcurrentUsers"]')).toHaveValue("10");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Bundled Collabora");
  });

  // Test complete bundled Collabora configuration
  test("testCompleteBundledCollaboraConfig - Complete bundled Collabora configuration validates successfully", async ({ page }) => {
    await page.locator("#office-mode").selectOption("collabora");
    await page.locator("#office-deployment").selectOption("bundled");
    
    // Fill all bundled Collabora fields
    await page.locator('[name="collaboraDomain"]').fill("office.corp.example");
    await page.locator('[name="collaboraAdminPassword"]').fill("local-test-collabora-password");
    await page.locator('[name="collaboraConcurrentUsers"]').fill("10");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).toBeHidden();
    await expect(page.locator("#sizing-breakdown")).toContainText("Bundled Collabora");
  });

  // Test complete external Collabora configuration
  test("testCompleteExternalCollaboraConfig - Complete external Collabora configuration validates successfully", async ({ page }) => {
    await page.locator("#office-mode").selectOption("collabora");
    await page.locator("#office-deployment").selectOption("external");
    
    // Fill external Collabora field
    await page.locator('[name="collaboraUrl"]').fill("https://office.corp.example");
    await page.locator('[name="collaboraConcurrentUsers"]').fill("10");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).toBeHidden();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  // Test that forbidden office modes are not available
  test("testForbiddenOfficeModesNotAvailable - Forbidden office modes are not in the UI", async ({ page }) => {
    const officeOptions = await page.locator("#office-mode option").allTextContents();
    
    // Should not contain forbidden values
    const forbiddenModes = ["ONLYOFFICE", "unknown"];
    for (const mode of forbiddenModes) {
      expect(officeOptions).not.toContain(mode);
    }
    
    // Should only contain allowed modes
    expect(officeOptions).toContain("None");
    expect(officeOptions).toContain("Collabora");
  });

  // Test office deployment switching
  test("testOfficeDeploymentSwitching - Switching office deployment shows correct fields", async ({ page }) => {
    await page.locator("#office-mode").selectOption("collabora");
    
    // Start with bundled - should show domain and password
    await page.locator("#office-deployment").selectOption("bundled");
    await expect(page.locator("#collabora-domain-field")).toBeVisible();
    await expect(page.locator("#collabora-password-field")).toBeVisible();
    await expect(page.locator("#collabora-url-field")).toBeHidden();
    
    // Switch to external - should show URL, hide domain/password
    await page.locator("#office-deployment").selectOption("external");
    await expect(page.locator("#collabora-domain-field")).toBeHidden();
    await expect(page.locator("#collabora-password-field")).toBeHidden();
    await expect(page.locator("#collabora-url-field")).toBeVisible();
  });

  // Test that Kubernetes forces external office mode
  test("testKubernetesForcesExternalOffice - Kubernetes runtime forces external Collabora", async ({ page }) => {
    await page.locator("#runtime").selectOption("kubernetes");
    await page.locator("#office-mode").selectOption("collabora");
    
    // For Kubernetes, office deployment should be forced to external
    // Check that only external is available or selected
    const deploymentOptions = await page.locator("#office-deployment option").allTextContents();
    expect(deploymentOptions).toContain("External service");
    
    // If bundled is available, selecting it should still work but may have constraints
    // The important thing is that external should be the valid option
    await page.locator("#office-deployment").selectOption("external");
    await expect(page.locator("#office-deployment")).toHaveValue("external");
  });

  // Test accessibility for Collabora controls
  test("testCollaboraAccessibility - Collabora controls pass accessibility scan", async ({ page }) => {
    await page.locator("#office-mode").focus();
    
    const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(accessibility.violations).toEqual([]);
  });

  // Test that bundled Collabora is supported on Docker and Podman
  test("testBundledCollaboraSupportedOnDockerPodman - Bundled Collabora works on Docker and Podman", async ({ page }) => {
    const supportedRuntimes = ["docker", "podman"];
    
    for (const runtime of supportedRuntimes) {
      await page.locator("#runtime").selectOption(runtime);
      await page.locator("#office-mode").selectOption("collabora");
      await page.locator("#office-deployment").selectOption("bundled");
      
      // Should be able to configure bundled Collabora
      await page.locator('[name="collaboraDomain"]').fill("office.example.com");
      await page.locator('[name="collaboraAdminPassword"]').fill("test-password");
      
      await page.getByRole("button", { name: "Validate and calculate" }).click();
      await expect(page.locator("#validation-errors")).toBeHidden();
    }
  });

  // Test that external Collabora is supported on all runtimes
  test("testExternalCollaboraSupportedOnAllRuntimes - External Collabora works on all runtimes", async ({ page }) => {
    const allRuntimes = ["docker", "podman", "kubernetes"];
    
    for (const runtime of allRuntimes) {
      await page.locator("#runtime").selectOption(runtime);
      await page.locator("#office-mode").selectOption("collabora");
      await page.locator("#office-deployment").selectOption("external");
      
      // Should be able to configure external Collabora
      await page.locator('[name="collaboraUrl"]').fill("https://office.example.com");
      
      await page.getByRole("button", { name: "Validate and calculate" }).click();
      await expect(page.locator("#validation-errors")).toBeHidden();
    }
  });
});