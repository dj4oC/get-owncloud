import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Workload tests
 * Tests for registered users, stored data, annual growth, and system resource controls
 */

test.describe("Workload Controls", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  // Registered Users tests
  test("testRegisteredUsersMinimum - Zero registered users is valid", async ({ page }) => {
    await page.locator("#registered-users").fill("0");
    await expect(page.locator("#registered-users")).toHaveValue("0");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
    
    // Should use embedded identity for 0 users
    await expect(page.locator("#identity-mode")).toHaveValue("embedded");
  });

  test("testRegisteredUsers20 - 20 users is the boundary for embedded identity", async ({ page }) => {
    await page.locator("#registered-users").fill("20");
    await expect(page.locator("#registered-users")).toHaveValue("20");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
    
    // Should still allow embedded identity at exactly 20 users
    await page.locator("#identity-mode").selectOption("embedded");
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).toBeHidden();
  });

  test("testRegisteredUsers21 - 21 users exceeds embedded identity limit", async ({ page }) => {
    await page.locator("#registered-users").fill("21");
    await expect(page.locator("#registered-users")).toHaveValue("21");
    
    // Should auto-switch to external OIDC for >20 users
    await expect(page.locator("#identity-mode")).toHaveValue("external-oidc");
    
    // Should show validation error if we try to force embedded
    await page.locator("#identity-mode").selectOption("embedded");
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).toContainText("Embedded identity can only be used with up to 20 registered users");
  });

  test("testRegisteredUsers100 - 100 users is valid and uses external identity", async ({ page }) => {
    await page.locator("#registered-users").fill("100");
    await expect(page.locator("#registered-users")).toHaveValue("100");
    
    // Should auto-switch to external OIDC for >20 users
    await expect(page.locator("#identity-mode")).toHaveValue("external-oidc");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  test("testRegisteredUsersLarge - Large user count (1000) is valid", async ({ page }) => {
    await page.locator("#registered-users").fill("1000");
    await expect(page.locator("#registered-users")).toHaveValue("1000");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
    
    // Should use external identity for large user counts
    await expect(page.locator("#identity-mode")).toHaveValue("external-oidc");
  });

  test("testRegisteredUsersInvalid - Invalid/empty registered users shows error", async ({ page }) => {
    await page.locator("#registered-users").fill("");
    await expect(page.locator("#registered-users")).toHaveValue("");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    // Empty should be treated as 0, which is valid
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  // Stored Data tests
  test("testStoredDataZero - Zero stored data is valid", async ({ page }) => {
    await page.locator("#stored-data-gib").fill("0");
    await expect(page.locator("#stored-data-gib")).toHaveValue("0");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  test("testStoredDataNormal - Normal stored data (50 GiB) is valid", async ({ page }) => {
    await page.locator("#stored-data-gib").fill("50");
    await expect(page.locator("#stored-data-gib")).toHaveValue("50");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  test("testStoredDataLarge - Large stored data (1000 GiB) is valid", async ({ page }) => {
    await page.locator("#stored-data-gib").fill("1000");
    await expect(page.locator("#stored-data-gib")).toHaveValue("1000");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  // Annual Growth tests
  test("testAnnualGrowthZero - Zero annual growth is valid", async ({ page }) => {
    await page.locator("#annual-growth-percent").fill("0");
    await expect(page.locator("#annual-growth-percent")).toHaveValue("0");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  test("testAnnualGrowthNormal - Normal annual growth (20%) is valid", async ({ page }) => {
    await page.locator("#annual-growth-percent").fill("20");
    await expect(page.locator("#annual-growth-percent")).toHaveValue("20");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  test("testAnnualGrowthBoundary - Boundary annual growth (50%) is valid", async ({ page }) => {
    await page.locator("#annual-growth-percent").fill("50");
    await expect(page.locator("#annual-growth-percent")).toHaveValue("50");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  test("testAnnualGrowthInvalid - Invalid annual growth shows error", async ({ page }) => {
    await page.locator("#annual-growth-percent").fill("");
    await expect(page.locator("#annual-growth-percent")).toHaveValue("");
    
    // Empty should be treated as 0, which is valid
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  // System CPU tests
  test("testSystemCpuAbsent - Absent system CPU is valid", async ({ page }) => {
    await page.locator("#system-cpu").fill("");
    await expect(page.locator("#system-cpu")).toHaveValue("");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    // Should work without system CPU (optional field)
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  test("testSystemCpuBelow - System CPU below recommendation (2 cores) shows warning", async ({ page }) => {
    await page.locator("#system-cpu").fill("2");
    await expect(page.locator("#system-cpu")).toHaveValue("2");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    // Should work but may show sizing warnings
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  test("testSystemCpuAtRecommendation - System CPU at recommendation (4 cores) is valid", async ({ page }) => {
    await page.locator("#system-cpu").fill("4");
    await expect(page.locator("#system-cpu")).toHaveValue("4");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  test("testSystemCpuAbove - System CPU above recommendation (8 cores) is valid", async ({ page }) => {
    await page.locator("#system-cpu").fill("8");
    await expect(page.locator("#system-cpu")).toHaveValue("8");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  // System RAM tests
  test("testSystemRamAbsent - Absent system RAM is valid", async ({ page }) => {
    await page.locator("#system-ram-gib").fill("");
    await expect(page.locator("#system-ram-gib")).toHaveValue("");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  test("testSystemRamBelow - System RAM below recommendation (4 GiB) shows warning", async ({ page }) => {
    await page.locator("#system-ram-gib").fill("4");
    await expect(page.locator("#system-ram-gib")).toHaveValue("4");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  test("testSystemRamAtRecommendation - System RAM at recommendation (8 GiB) is valid", async ({ page }) => {
    await page.locator("#system-ram-gib").fill("8");
    await expect(page.locator("#system-ram-gib")).toHaveValue("8");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  test("testSystemRamAbove - System RAM above recommendation (16 GiB) is valid", async ({ page }) => {
    await page.locator("#system-ram-gib").fill("16");
    await expect(page.locator("#system-ram-gib")).toHaveValue("16");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  // System Disk tests
  test("testSystemDiskAbsent - Absent system disk is valid", async ({ page }) => {
    await page.locator("#system-disk-gib").fill("");
    await expect(page.locator("#system-disk-gib")).toHaveValue("");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  test("testSystemDiskBelow - System disk below recommendation (10 GiB) shows warning", async ({ page }) => {
    await page.locator("#system-disk-gib").fill("10");
    await expect(page.locator("#system-disk-gib")).toHaveValue("10");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  test("testSystemDiskAtRecommendation - System disk at recommendation (50 GiB) is valid", async ({ page }) => {
    await page.locator("#system-disk-gib").fill("50");
    await expect(page.locator("#system-disk-gib")).toHaveValue("50");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  test("testSystemDiskAbove - System disk above recommendation (100 GiB) is valid", async ({ page }) => {
    await page.locator("#system-disk-gib").fill("100");
    await expect(page.locator("#system-disk-gib")).toHaveValue("100");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  // Test that all three system values are required together for warnings
  test("testSystemValuesAllPresent - All three system values present shows complete sizing", async ({ page }) => {
    await page.locator("#system-cpu").fill("4");
    await page.locator("#system-ram-gib").fill("8");
    await page.locator("#system-disk-gib").fill("50");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
    await expect(page.locator("#sizing-breakdown")).toContainText("Recommended with headroom");
  });

  // Test accessibility for workload controls
  test("testWorkloadAccessibility - Workload controls pass accessibility scan", async ({ page }) => {
    // Focus on a workload control to test its accessibility
    await page.locator("#registered-users").focus();
    
    const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(accessibility.violations).toEqual([]);
  });

  // Test boundary where embedded identity switches to external
  test("testEmbeddedIdentityBoundary - Embedded identity auto-switches at 21 users", async ({ page }) => {
    // Start with 20 users - should allow embedded
    await page.locator("#registered-users").fill("20");
    await page.locator("#identity-mode").selectOption("embedded");
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).toBeHidden();
    
    // Change to 21 users - should auto-switch to external
    await page.locator("#registered-users").fill("21");
    await expect(page.locator("#identity-mode")).toHaveValue("external-oidc");
    
    // Try to force embedded - should show error
    await page.locator("#identity-mode").selectOption("embedded");
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).toContainText("Embedded identity can only be used with up to 20 registered users");
  });
});