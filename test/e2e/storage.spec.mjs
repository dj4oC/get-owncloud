import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Storage tests
 * Tests for storage mode, filesystem, and S3 configuration controls
 */

test.describe("Storage Controls", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for catalogs to be loaded by checking for an element that's updated after loading
    await page.waitForSelector("#image-digest-note", { state: "visible" });
    await page.waitForTimeout(500);
  });

  // Storage Mode tests
  test("testStorageModeOcis - OCIS storage mode is the default and works", async ({ page }) => {
    await page.locator("#storage-mode").selectOption("ocis");
    await expect(page.locator("#storage-mode")).toHaveValue("ocis");
    
    // S3 fields should be hidden for OCIS mode
    await expect(page.locator("#s3-fields")).toBeHidden();
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
    
    // Check accessibility
    const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(accessibility.violations).toEqual([]);
  });

  test("testStorageModeS3ng - S3NG storage mode shows required fields", async ({ page }) => {
    await page.locator("#storage-mode").selectOption("s3ng");
    await expect(page.locator("#storage-mode")).toHaveValue("s3ng");
    
    // S3 fields should be visible for S3NG mode
    await expect(page.locator("#s3-fields")).toBeVisible();
    
    // All S3 fields should be available
    await expect(page.locator('[name="s3Endpoint"]')).toBeVisible();
    await expect(page.locator('[name="s3Region"]')).toBeVisible();
    await expect(page.locator('[name="s3Bucket"]')).toBeVisible();
    await expect(page.locator('[name="s3AccessKey"]')).toBeVisible();
    await expect(page.locator('[name="s3SecretKey"]')).toBeVisible();
  });

  // Filesystem tests
  test("testFilesystemExt4 - Ext4 filesystem selection works", async ({ page }) => {
    await page.locator("#filesystem").selectOption("ext4");
    await expect(page.locator("#filesystem")).toHaveValue("ext4");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  test("testFilesystemXfs - XFS filesystem selection works", async ({ page }) => {
    await page.locator("#filesystem").selectOption("xfs");
    await expect(page.locator("#filesystem")).toHaveValue("xfs");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  test("testFilesystemBtrfs - Btrfs filesystem selection works", async ({ page }) => {
    await page.locator("#filesystem").selectOption("btrfs");
    await expect(page.locator("#filesystem")).toHaveValue("btrfs");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  test("testFilesystemZfs - ZFS filesystem selection works", async ({ page }) => {
    await page.locator("#filesystem").selectOption("zfs");
    await expect(page.locator("#filesystem")).toHaveValue("zfs");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  test("testFilesystemNfs - NFS filesystem selection works with version requirement", async ({ page }) => {
    await page.locator("#filesystem").selectOption("nfs");
    await expect(page.locator("#filesystem")).toHaveValue("nfs");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    // Should show warning or note about NFSv4.2 requirement
    await expect(page.getByText("NFS selection is blocked unless", { exact: false })).toBeVisible();
  });

  // Data Path tests
  test("testDataPathDefault - Default data path is valid", async ({ page }) => {
    await page.locator('[name="dataPath"]').fill("./data/data");
    await expect(page.locator('[name="dataPath"]')).toHaveValue("./data/data");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  test("testDataPathCustom - Custom data path is valid", async ({ page }) => {
    await page.locator('[name="dataPath"]').fill("/srv/owncloud/data");
    await expect(page.locator('[name="dataPath"]')).toHaveValue("/srv/owncloud/data");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  // Config Path tests
  test("testConfigPathDefault - Default config path is valid", async ({ page }) => {
    await page.locator('[name="configPath"]').fill("./data/config");
    await expect(page.locator('[name="configPath"]')).toHaveValue("./data/config");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  test("testConfigPathCustom - Custom config path is valid", async ({ page }) => {
    await page.locator('[name="configPath"]').fill("/srv/owncloud/config");
    await expect(page.locator('[name="configPath"]')).toHaveValue("/srv/owncloud/config");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  // S3 Configuration tests
  test("testS3EndpointValid - Valid S3 endpoint is accepted", async ({ page }) => {
    await page.locator("#storage-mode").selectOption("s3ng");
    await page.locator('[name="s3Endpoint"]').fill("https://s3.corp.example");
    await expect(page.locator('[name="s3Endpoint"]')).toHaveValue("https://s3.corp.example");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).not.toContainText("s3Endpoint");
  });

  test("testS3RegionValid - Valid S3 region is accepted", async ({ page }) => {
    await page.locator("#storage-mode").selectOption("s3ng");
    await page.locator('[name="s3Region"]').fill("us-east-1");
    await expect(page.locator('[name="s3Region"]')).toHaveValue("us-east-1");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).not.toContainText("s3Region");
  });

  test("testS3BucketValid - Valid S3 bucket is accepted", async ({ page }) => {
    await page.locator("#storage-mode").selectOption("s3ng");
    await page.locator('[name="s3Bucket"]').fill("owncloud-data");
    await expect(page.locator('[name="s3Bucket"]')).toHaveValue("owncloud-data");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).not.toContainText("s3Bucket");
  });

  test("testS3AccessKeyValid - Valid S3 access key is accepted", async ({ page }) => {
    await page.locator("#storage-mode").selectOption("s3ng");
    await page.locator('[name="s3AccessKey"]').fill("test-access-key");
    await expect(page.locator('[name="s3AccessKey"]')).toHaveValue("test-access-key");
    
    // Check that access key is password type
    await expect(page.locator('[name="s3AccessKey"]')).toHaveAttribute("type", "password");
  });

  test("testS3SecretKeyValid - Valid S3 secret key is accepted", async ({ page }) => {
    await page.locator("#storage-mode").selectOption("s3ng");
    await page.locator('[name="s3SecretKey"]').fill("test-secret-key");
    await expect(page.locator('[name="s3SecretKey"]')).toHaveValue("test-secret-key");
    
    // Check that secret key is password type
    await expect(page.locator('[name="s3SecretKey"]')).toHaveAttribute("type", "password");
  });

  // Test complete S3NG configuration
  test("testCompleteS3ngConfig - Complete S3NG configuration validates successfully", async ({ page }) => {
    await page.locator("#storage-mode").selectOption("s3ng");
    
    // Fill all S3 fields
    await page.locator('[name="s3Endpoint"]').fill("https://s3.corp.example");
    await page.locator('[name="s3Region"]').fill("us-east-1");
    await page.locator('[name="s3Bucket"]').fill("owncloud-data");
    await page.locator('[name="s3AccessKey"]').fill("test-access-key");
    await page.locator('[name="s3SecretKey"]').fill("test-secret-key");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).toBeHidden();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  // Test storage mode switching
  test("testStorageModeSwitching - Switching storage mode shows/hides S3 fields", async ({ page }) => {
    // Start with S3NG - S3 fields should be visible
    await page.locator("#storage-mode").selectOption("s3ng");
    await expect(page.locator("#s3-fields")).toBeVisible();
    
    // Switch to OCIS - S3 fields should be hidden
    await page.locator("#storage-mode").selectOption("ocis");
    await expect(page.locator("#s3-fields")).toBeHidden();
    
    // Switch back to S3NG - S3 fields should be visible again
    await page.locator("#storage-mode").selectOption("s3ng");
    await expect(page.locator("#s3-fields")).toBeVisible();
  });

  // Test password field security for S3
  test("testS3PasswordFieldSecurity - S3 password fields use secure input type", async ({ page }) => {
    await page.locator("#storage-mode").selectOption("s3ng");
    
    // Check that S3 credential fields are of type password
    await expect(page.locator('[name="s3AccessKey"]')).toHaveAttribute("type", "password");
    await expect(page.locator('[name="s3SecretKey"]')).toHaveAttribute("type", "password");
    
    // Check autocomplete attributes for security
    await expect(page.locator('[name="s3AccessKey"]')).toHaveAttribute("autocomplete", "new-password");
    await expect(page.locator('[name="s3SecretKey"]')).toHaveAttribute("autocomplete", "new-password");
  });

  // Test that forbidden storage modes are not available
  test("testForbiddenStorageModesNotAvailable - Forbidden storage modes are not in the UI", async ({ page }) => {
    const storageOptions = await page.locator("#storage-mode option").allTextContents();
    
    // Should not contain any of the forbidden values
    const forbiddenModes = ["posixfs", "posix", "xattr", "GPFS", "CephFS", "EOS"];
    for (const mode of forbiddenModes) {
      expect(storageOptions).not.toContain(mode);
    }
    
    // Should only contain allowed modes
    expect(storageOptions).toContain("Standard ocis driver");
    expect(storageOptions).toContain("s3ng blobs with POSIX metadata");
  });

  // Test accessibility for storage controls
  test("testStorageAccessibility - Storage controls pass accessibility scan", async ({ page }) => {
    await page.locator("#storage-mode").focus();
    
    const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(accessibility.violations).toEqual([]);
  });

  // Test that S3NG requires all fields
  test("testS3ngRequiresAllFields - S3NG storage mode requires all S3 fields for generation", async ({ page }) => {
    await page.locator("#storage-mode").selectOption("s3ng");
    await page.locator('[name="s3Endpoint"]').fill("https://s3.corp.example");
    // Leave other S3 fields empty
    
    await page.locator("#eula").check();
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    
    // Should show validation errors for missing S3 fields
    await expect(page.locator("#validation-errors")).toBeVisible();
  });
});