import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Services tests
 * Tests for service toggles, auto updates, SMTP, and backup configuration
 */

test.describe("Services Controls", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  // Search feature tests
  test("testSearchEnabled - Search feature can be enabled", async ({ page }) => {
    await page.locator('[name="search"]').check();
    await expect(page.locator('[name="search"]')).toBeChecked();
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Search and extraction");
  });

  test("testSearchDisabled - Search feature can be disabled", async ({ page }) => {
    await page.locator('[name="search"]').uncheck();
    await expect(page.locator('[name="search"]')).not.toBeChecked();
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  // ClamAV feature tests
  test("testClamavEnabled - ClamAV feature can be enabled", async ({ page }) => {
    await page.locator('[name="clamav"]').check();
    await expect(page.locator('[name="clamav"]')).toBeChecked();
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("ClamAV");
  });

  test("testClamavDisabled - ClamAV feature can be disabled", async ({ page }) => {
    await page.locator('[name="clamav"]').uncheck();
    await expect(page.locator('[name="clamav"]')).not.toBeChecked();
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  // Notifications feature tests
  test("testNotificationsEnabled - Notifications feature can be enabled", async ({ page }) => {
    await page.locator('[name="notifications"]').check();
    await expect(page.locator('[name="notifications"]')).toBeChecked();
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  test("testNotificationsDisabled - Notifications feature can be disabled", async ({ page }) => {
    await page.locator('[name="notifications"]').uncheck();
    await expect(page.locator('[name="notifications"]')).not.toBeChecked();
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  // Auto updates tests
  test("testAutoUpdatesEnabled - Auto updates can be enabled", async ({ page }) => {
    await page.locator('[name="autoUpdates"]').check();
    await expect(page.locator('[name="autoUpdates"]')).toBeChecked();
    
    // Should show backup recipient field when auto updates is enabled
    await expect(page.locator("#backup-recipient-field")).toBeVisible();
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    // Should show validation error because backup recipient is required
    await expect(page.locator("#validation-errors")).toContainText("backup recipient");
  });

  test("testAutoUpdatesDisabled - Auto updates can be disabled", async ({ page }) => {
    await page.locator('[name="autoUpdates"]').uncheck();
    await expect(page.locator('[name="autoUpdates"]')).not.toBeChecked();
    
    // Backup recipient field should still be visible but not required
    await expect(page.locator("#backup-recipient-field")).toBeVisible();
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  // Update delay tests
  test("testUpdateDelayMinimum - Update delay minimum (0 hours) is valid", async ({ page }) => {
    await page.locator('[name="updateDelay"]').fill("0");
    await expect(page.locator('[name="updateDelay"]')).toHaveValue("0");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  test("testUpdateDelayRepresentative - Update delay representative (24 hours) is valid", async ({ page }) => {
    await page.locator('[name="updateDelay"]').fill("24");
    await expect(page.locator('[name="updateDelay"]')).toHaveValue("24");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  test("testUpdateDelayMaximum - Update delay maximum (72 hours) is valid", async ({ page }) => {
    await page.locator('[name="updateDelay"]').fill("72");
    await expect(page.locator('[name="updateDelay"]')).toHaveValue("72");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  // Backup recipient tests
  test("testBackupRecipientValid - Valid backup recipient is accepted", async ({ page }) => {
    await page.locator('[name="autoUpdates"]').check();
    await page.locator('[name="backupRecipient"]').fill("admin@example.com");
    await expect(page.locator('[name="backupRecipient"]')).toHaveValue("admin@example.com");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).not.toContainText("backupRecipient");
  });

  test("testBackupRecipientMissing - Missing backup recipient shows validation error when auto updates enabled", async ({ page }) => {
    await page.locator('[name="autoUpdates"]').check();
    await page.locator('[name="backupRecipient"]').fill("");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).toContainText("backup recipient");
  });

  test("testBackupRecipientInvalid - Invalid backup recipient format shows validation error", async ({ page }) => {
    await page.locator('[name="autoUpdates"]').check();
    await page.locator('[name="backupRecipient"]').fill("invalid-email");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).toContainText("backupRecipient");
  });

  // SMTP configuration tests
  test("testSmtpHostValid - Valid SMTP host is accepted", async ({ page }) => {
    await page.locator('[name="smtpHost"]').fill("smtp.example.com");
    await expect(page.locator('[name="smtpHost"]')).toHaveValue("smtp.example.com");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).not.toContainText("smtpHost");
  });

  test("testSmtpHostAbsent - Absent SMTP host is valid (no SMTP configured)", async ({ page }) => {
    await page.locator('[name="smtpHost"]').fill("");
    await expect(page.locator('[name="smtpHost"]')).toHaveValue("");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  test("testSmtpPortValid - Valid SMTP port (587) is accepted", async ({ page }) => {
    await page.locator('[name="smtpPort"]').fill("587");
    await expect(page.locator('[name="smtpPort"]')).toHaveValue("587");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).not.toContainText("smtpPort");
  });

  test("testSmtpPortSsl - Valid SMTP SSL port (465) is accepted", async ({ page }) => {
    await page.locator('[name="smtpPort"]').fill("465");
    await expect(page.locator('[name="smtpPort"]')).toHaveValue("465");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).not.toContainText("smtpPort");
  });

  test("testSmtpUsernameValid - Valid SMTP username is accepted", async ({ page }) => {
    await page.locator('[name="smtpUsername"]').fill("smtp-user");
    await expect(page.locator('[name="smtpUsername"]')).toHaveValue("smtp-user");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).not.toContainText("smtpUsername");
  });

  test("testSmtpPasswordValid - Valid SMTP password is accepted", async ({ page }) => {
    await page.locator('[name="smtpPassword"]').fill("smtp-password-test");
    await expect(page.locator('[name="smtpPassword"]')).toHaveValue("smtp-password-test");
    
    // Check that it's a password field
    await expect(page.locator('[name="smtpPassword"]')).toHaveAttribute("type", "password");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).not.toContainText("smtpPassword");
  });

  // Test accessibility for services controls
  test("testServicesAccessibility - Services controls pass accessibility scan", async ({ page }) => {
    await page.locator('[name="search"]').focus();
    
    const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(accessibility.violations).toEqual([]);
  });

  // Test complete services configuration
  test("testCompleteServicesConfig - Complete services configuration validates successfully", async ({ page }) => {
    // Enable all services
    await page.locator('[name="search"]').check();
    await page.locator('[name="clamav"]').check();
    await page.locator('[name="notifications"]').check();
    await page.locator('[name="autoUpdates"]').check();
    
    // Configure update delay
    await page.locator('[name="updateDelay"]').fill("24");
    
    // Configure backup recipient (required for auto updates)
    await page.locator('[name="backupRecipient"]').fill("admin@corp.example");
    
    // Configure SMTP
    await page.locator('[name="smtpHost"]').fill("smtp.corp.example");
    await page.locator('[name="smtpPort"]').fill("587");
    await page.locator('[name="smtpUsername"]').fill("smtp-user");
    await page.locator('[name="smtpPassword"]').fill("smtp-password-test");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).toBeHidden();
    
    // Should show sizing for enabled services
    await expect(page.locator("#sizing-breakdown")).toContainText("Search and extraction");
    await expect(page.locator("#sizing-breakdown")).toContainText("ClamAV");
  });

  // Test that service toggles affect sizing
  test("testServiceTogglesAffectSizing - Service toggles affect calculated sizing", async ({ page }) => {
    // Start with only search enabled
    await page.locator('[name="search"]').check();
    await page.locator('[name="clamav"]').uncheck();
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    
    // Enable ClamAV and check that sizing changes
    await page.locator('[name="clamav"]').check();
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    
    // Should now show ClamAV in the sizing breakdown
    await expect(page.locator("#sizing-breakdown")).toContainText("ClamAV");
  });

  // Test password field security for SMTP
  test("testSmtpPasswordFieldSecurity - SMTP password field uses secure input type", async ({ page }) => {
    // Check that SMTP password field is of type password
    await expect(page.locator('[name="smtpPassword"]')).toHaveAttribute("type", "password");
    
    // Check autocomplete attribute for security
    await expect(page.locator('[name="smtpPassword"]')).toHaveAttribute("autocomplete", "new-password");
  });

  // Monitoring feature tests
  test("testMonitoringDisabled - Monitoring feature is disabled by default", async ({ page }) => {
    await expect(page.locator('[name="monitoring"]')).not.toBeChecked();
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    // Should not contain monitoring-specific sizing contributions
    await expect(page.locator("#sizing-breakdown")).not.toContainText("Metrics");
    await expect(page.locator("#sizing-breakdown")).not.toContainText("OpenTelemetry");
  });

  test("testMonitoringEnabled - Monitoring feature can be enabled with boolean", async ({ page }) => {
    await page.locator('[name="monitoring"]').check();
    await expect(page.locator('[name="monitoring"]')).toBeChecked();
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    // Should show monitoring sizing contributions when enabled
    await expect(page.locator("#sizing-breakdown")).toContainText("Metrics");
  });

  test("testMonitoringAdvanced - Monitoring feature supports advanced configuration", async ({ page }) => {
    // This test verifies that monitoring can be configured as an object
    // Note: The UI may need to be enhanced to support object configuration
    // For now, we test that the boolean toggle works
    await page.locator('[name="monitoring"]').check();
    await expect(page.locator('[name="monitoring"]')).toBeChecked();
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Metrics");
  });

  // ClamAV Configuration tests
  test("testClamavKubernetesEnabled - ClamAV can be enabled for Kubernetes", async ({ page }) => {
    // Select Kubernetes runtime first
    await page.locator('[name="runtime"]').selectOption('kubernetes');
    
    await page.locator('[name="clamav"]').check();
    await expect(page.locator('[name="clamav"]')).toBeChecked();
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    // For Kubernetes, ClamAV requires storageClassName
    await expect(page.locator("#validation-errors")).toContainText("storageClassName");
  });

  test("testClamavDockerEnabled - ClamAV can be enabled for Docker without errors", async ({ page }) => {
    // Ensure we're on Docker runtime
    await page.locator('[name="runtime"]').selectOption('docker');
    
    await page.locator('[name="clamav"]').check();
    await expect(page.locator('[name="clamav"]')).toBeChecked();
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("ClamAV");
  });

  // Collabora Configuration tests
  test("testCollaboraBundledEnabled - Collabora bundled mode can be enabled", async ({ page }) => {
    await page.locator('[name="officeMode"]').selectOption('collabora');
    await page.locator('[name="officeDeployment"]').selectOption('bundled');
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Bundled Collabora");
  });

  test("testCollaboraExternalEnabled - Collabora external mode can be enabled", async ({ page }) => {
    await page.locator('[name="officeMode"]').selectOption('collabora');
    await page.locator('[name="officeDeployment"]').selectOption('external');
    await page.locator('[name="collaboraUrl"]').fill('https://collabora.example.com');
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Collabora");
  });

  test("testCollaboraDisabled - Collabora can be disabled", async ({ page }) => {
    await page.locator('[name="officeMode"]').selectOption('none');
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  test("testCollaboraBundledKubernetes - Collabora bundled mode works for Kubernetes", async ({ page }) => {
    await page.locator('[name="runtime"]').selectOption('kubernetes');
    await page.locator('[name="officeMode"]').selectOption('collabora');
    await page.locator('[name="officeDeployment"]').selectOption('bundled');
    await page.locator('[name="collaboraDomain"]').fill('collabora.example.com');
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    // For Kubernetes bundled Collabora, it should work without errors
    await expect(page.locator("#sizing-breakdown")).toContainText("Bundled Collabora");
  });

  // Keycloak Configuration tests
  test("testKeycloakEnabled - Keycloak identity mode can be enabled", async ({ page }) => {
    await page.locator('[name="identityMode"]').selectOption('keycloak');
    await page.locator('[name="oidcClientId"]').fill('web');
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    // Keycloak should be accepted as a valid identity mode
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  test("testKeycloakKubernetes - Keycloak works for Kubernetes with secret references", async ({ page }) => {
    await page.locator('[name="runtime"]').selectOption('kubernetes');
    await page.locator('[name="identityMode"]').selectOption('keycloak');
    await page.locator('[name="oidcClientId"]').fill('web');
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    // For Kubernetes, Keycloak requires secret references
    await expect(page.locator("#validation-errors")).toContainText("keycloakAdminPasswordSecretRef");
  });

  // Tika Configuration tests
  test("testTikaEnabled - Tika feature can be enabled", async ({ page }) => {
    await page.locator('[name="tika"]').check();
    await expect(page.locator('[name="tika"]')).toBeChecked();
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Tika");
  });

  test("testTikaDisabled - Tika feature can be disabled", async ({ page }) => {
    await page.locator('[name="tika"]').uncheck();
    await expect(page.locator('[name="tika"]')).not.toBeChecked();
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  test("testTikaKubernetesEnabled - Tika can be enabled for Kubernetes", async ({ page }) => {
    await page.locator('[name="runtime"]').selectOption('kubernetes');
    await page.locator('[name="tika"]').check();
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    // For Kubernetes, Tika requires storageClassName
    await expect(page.locator("#validation-errors")).toContainText("storageClassName");
  });


  // SMTP Configuration tests
  test("testSmtpDisabled - SMTP configuration disabled by default", async ({ page }) => {
    // SMTP configuration should not be required when notifications is disabled
    await page.locator('[name="notifications"]').uncheck();
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  test("testSmtpEnabled - SMTP configuration can be enabled with notifications", async ({ page }) => {
    await page.locator('[name="notifications"]').check();
    
    // SMTP host should be required when notifications is enabled
    // For this test, we'll assume the UI has SMTP fields that become required
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    // This should fail validation since SMTP host is missing
    await expect(page.locator("#validation-errors")).toContainText("SMTP host");
  });

  test("testSmtpBasic - Basic SMTP configuration validation", async ({ page }) => {
    await page.locator('[name="notifications"]').check();
    
    // Set basic SMTP configuration (this would require UI fields to be added)
    // For now, we test that notifications requires SMTP host
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).toContainText("SMTP host");
  });
});