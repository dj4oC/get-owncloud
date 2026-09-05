import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Legal tests
 * Tests for EULA acceptance and generation enablement
 */

test.describe("Legal Controls", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  // EULA tests
  test("testEulaUnchecked - Unchecked EULA disables generation", async ({ page }) => {
    await page.locator("#eula").uncheck();
    await expect(page.locator("#eula")).not.toBeChecked();
    
    // Generation should be disabled when EULA is unchecked
    await expect(page.locator("#generate")).toBeDisabled();
    
    // Should show status indicating generation is disabled
    await expect(page.locator("#generate-status")).toContainText("not yet valid");
  });

  test("testEulaChecked - Checked EULA enables generation", async ({ page }) => {
    // First ensure we have a valid configuration
    await page.locator("#registered-users").fill("20");
    await page.locator("#identity-mode").selectOption("embedded");
    
    await page.locator("#eula").check();
    await expect(page.locator("#eula")).toBeChecked();
    
    // Generation should be enabled when EULA is checked and configuration is valid
    await expect(page.locator("#generate")).toBeEnabled();
  });

  test("testEulaUncheckedAgain - Unchecking EULA again after checking disables generation", async ({ page }) => {
    // Start with EULA checked
    await page.locator("#eula").check();
    await expect(page.locator("#eula")).toBeChecked();
    
    // Uncheck it again
    await page.locator("#eula").uncheck();
    await expect(page.locator("#eula")).not.toBeChecked();
    
    // Generation should be disabled again
    await expect(page.locator("#generate")).toBeDisabled();
  });

  // Test accessibility for legal controls
  test("testLegalAccessibility - Legal controls pass accessibility scan", async ({ page }) => {
    await page.locator("#eula").focus();
    
    const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(accessibility.violations).toEqual([]);
  });

  // Test that EULA is required for generation
  test("testEulaRequiredForGeneration - EULA acceptance is required for bundle generation", async ({ page }) => {
    // Ensure configuration is valid but EULA is not checked
    await page.locator("#registered-users").fill("20");
    await page.locator("#identity-mode").selectOption("embedded");
    await page.locator("#eula").uncheck();
    
    // Try to click generate - should be disabled
    await expect(page.locator("#generate")).toBeDisabled();
    
    // Check EULA and try again
    await page.locator("#eula").check();
    await expect(page.locator("#generate")).toBeEnabled();
  });

  // Test EULA label and description
  test("testEulaHasProperLabel - EULA checkbox has proper label and description", async ({ page }) => {
    // Check that the EULA checkbox exists and is properly labeled
    const eulaCheckbox = page.locator("#eula");
    await expect(eulaCheckbox).toBeVisible();
    
    // Check that the label describes the EULA properly
    const labelText = await page.locator("label[for='eula']").textContent();
    expect(labelText.toLowerCase()).toContain("eula");
  });

  // Test that generation status updates with EULA state
  test("testGenerationStatusUpdatesWithEula - Generation status updates based on EULA acceptance", async ({ page }) => {
    // With EULA unchecked
    await page.locator("#eula").uncheck();
    await expect(page.locator("#generate-status")).toContainText("not yet valid");
    
    // With EULA checked
    await page.locator("#eula").check();
    await expect(page.locator("#generate-status")).not.toContainText("not yet valid");
  });
});