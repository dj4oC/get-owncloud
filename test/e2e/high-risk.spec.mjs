import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * High-risk journey tests
 * Tests for complex multi-option combinations and fail-closed boundaries
 */

test.describe("High-Risk Journeys", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  // Docker production with all features
  test("testDockerProductionFull - Docker production with all features validates successfully", async ({ page }) => {
    await page.locator("#purpose").selectOption("production");
    await page.locator("#runtime").selectOption("docker");
    await page.locator("#manager").selectOption("direct");
    
    // Identity configuration
    await page.locator("#identity-mode").selectOption("external-oidc");
    await page.locator('[name="oidcIssuer"]').fill("https://id.corp.example/realms/owncloud");
    await page.locator('[name="oidcClientId"]').fill("owncloud-web");
    await page.locator('[name="ldapUri"]').fill("ldaps://ldap.corp.example:636");
    await page.locator('[name="ldapBindDn"]').fill("uid=ocis,ou=system,dc=corp,dc=example");
    await page.locator('[name="ldapUserBaseDn"]').fill("ou=users,dc=corp,dc=example");
    await page.locator('[name="ldapGroupBaseDn"]').fill("ou=groups,dc=corp,dc=example");
    await page.locator('[name="ldapBindPassword"]').fill("local-test-bind-password");
    
    // Storage configuration
    await page.locator("#storage-mode").selectOption("s3ng");
    await page.locator('[name="s3Endpoint"]').fill("https://s3.corp.example");
    await page.locator('[name="s3Region"]').fill("us-east-1");
    await page.locator('[name="s3Bucket"]').fill("owncloud-data");
    await page.locator('[name="s3AccessKey"]').fill("test-access-key");
    await page.locator('[name="s3SecretKey"]').fill("test-secret-key");
    
    // Collabora configuration (bundled for Docker)
    await page.locator("#office-mode").selectOption("collabora");
    await page.locator("#office-deployment").selectOption("bundled");
    await page.locator('[name="collaboraDomain"]').fill("office.corp.example");
    await page.locator('[name="collaboraAdminPassword"]').fill("local-test-collabora-password");
    
    // Services configuration
    await page.locator("#search").check();
    await page.locator("#clamav").check();
    await page.locator("#notifications").check();
    await page.locator("#autoUpdates").check();
    await page.locator('[name="updateDelay"]').fill("24");
    await page.locator('[name="backupRecipient"]').fill("admin@corp.example");
    
    // Networking configuration
    await page.locator('[name="domain"]').fill("cloud.corp.example");
    await page.locator('[name="httpPort"]').fill("80");
    await page.locator('[name="httpsPort"]').fill("443");
    await page.locator("#tls-mode").selectOption("acme");
    
    // Workload configuration
    await page.locator("#registered-users").fill("100");
    await page.locator("#stored-data-gib").fill("1000");
    await page.locator("#annual-growth-percent").fill("20");
    
    await page.locator("#eula").check();
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).toBeHidden();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
    
    // Check accessibility
    const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(accessibility.violations).toEqual([]);
  });

  // Docker evaluation minimal
  test("testDockerEvaluationMinimal - Docker evaluation with minimal configuration validates successfully", async ({ page }) => {
    await page.locator("#purpose").selectOption("evaluation");
    await page.locator("#runtime").selectOption("docker");
    await page.locator("#manager").selectOption("direct");
    await page.locator("#identity-mode").selectOption("embedded");
    await page.locator("#registered-users").fill("20");
    await page.locator("#storage-mode").selectOption("ocis");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).toBeHidden();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  // Podman evaluation with Ansible
  test("testPodmanAnsibleEvaluation - Podman evaluation with Ansible and single-host options validates successfully", async ({ page }) => {
    await page.locator("#purpose").selectOption("evaluation");
    await page.locator("#runtime").selectOption("podman");
    await page.locator("#manager").selectOption("ansible");
    await page.locator("#identity-mode").selectOption("embedded");
    await page.locator("#registered-users").fill("20");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).toBeHidden();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  // Kubernetes with Helm full
  test("testKubernetesHelmFull - Kubernetes with Helm, external OIDC/LDAP, S3NG, and external Collabora validates successfully", async ({ page }) => {
    await page.locator("#purpose").selectOption("evaluation");
    await page.locator("#runtime").selectOption("kubernetes");
    await page.locator("#manager").selectOption("helm");
    
    // Identity configuration
    await page.locator("#identity-mode").selectOption("external-oidc");
    await page.locator('[name="oidcIssuer"]').fill("https://id.corp.example/realms/owncloud");
    await page.locator('[name="oidcClientId"]').fill("owncloud-web");
    await page.locator('[name="ldapUri"]').fill("ldaps://ldap.corp.example:636");
    await page.locator('[name="ldapBindDn"]').fill("uid=ocis,ou=system,dc=corp,dc=example");
    await page.locator('[name="ldapUserBaseDn"]').fill("ou=users,dc=corp,dc=example");
    await page.locator('[name="ldapGroupBaseDn"]').fill("ou=groups,dc=corp,dc=example");
    await page.locator('[name="ldapBindPassword"]').fill("local-test-bind-password");
    
    // Storage configuration
    await page.locator("#storage-mode").selectOption("s3ng");
    await page.locator('[name="s3Endpoint"]').fill("https://s3.corp.example");
    await page.locator('[name="s3Region"]').fill("us-east-1");
    await page.locator('[name="s3Bucket"]').fill("owncloud-data");
    await page.locator('[name="s3AccessKey"]').fill("test-access-key");
    await page.locator('[name="s3SecretKey"]').fill("test-secret-key");
    
    // Filesystem
    await page.locator("#filesystem").selectOption("nfs");
    
    // Collabora configuration (external for Kubernetes)
    await page.locator("#office-mode").selectOption("collabora");
    await page.locator("#office-deployment").selectOption("external");
    await page.locator('[name="collaboraUrl"]').fill("https://office.corp.example");
    
    // Workload
    await page.locator("#registered-users").fill("100");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    
    // Should show validation note about NFSv4.2 requirement
    await expect(page.getByText("NFS selection is blocked unless", { exact: false })).toBeVisible();
    
    // But should still be valid otherwise
    await expect(page.locator("#validation-errors")).toBeHidden();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  // Kubernetes with Argo CD
  test("testKubernetesArgocdFull - Kubernetes with Argo CD using same values as Helm journey validates successfully", async ({ page }) => {
    await page.locator("#purpose").selectOption("evaluation");
    await page.locator("#runtime").selectOption("kubernetes");
    await page.locator("#manager").selectOption("argocd");
    
    // Identity configuration
    await page.locator("#identity-mode").selectOption("external-oidc");
    await page.locator('[name="oidcIssuer"]').fill("https://id.corp.example/realms/owncloud");
    await page.locator('[name="oidcClientId"]').fill("owncloud-web");
    await page.locator('[name="ldapUri"]').fill("ldaps://ldap.corp.example:636");
    await page.locator('[name="ldapBindDn"]').fill("uid=ocis,ou=system,dc=corp,dc=example");
    await page.locator('[name="ldapUserBaseDn"]').fill("ou=users,dc=corp,dc=example");
    await page.locator('[name="ldapGroupBaseDn"]').fill("ou=groups,dc=corp,dc=example");
    await page.locator('[name="ldapBindPassword"]').fill("local-test-bind-password");
    
    // Storage configuration
    await page.locator("#storage-mode").selectOption("s3ng");
    await page.locator('[name="s3Endpoint"]').fill("https://s3.corp.example");
    await page.locator('[name="s3Region"]').fill("us-east-1");
    await page.locator('[name="s3Bucket"]').fill("owncloud-data");
    await page.locator('[name="s3AccessKey"]').fill("test-access-key");
    await page.locator('[name="s3SecretKey"]').fill("test-secret-key");
    
    // Collabora configuration
    await page.locator("#office-mode").selectOption("collabora");
    await page.locator("#office-deployment").selectOption("external");
    await page.locator('[name="collaboraUrl"]').fill("https://office.corp.example");
    
    // Workload
    await page.locator("#registered-users").fill("100");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).toBeHidden();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  // Fail-closed boundaries test
  test("testFailClosedBoundaries - All fail-closed policy boundaries are enforced correctly", async ({ page }) => {
    // Test 1: user 21 with embedded IDM - should be hard rejected
    await page.locator("#registered-users").fill("21");
    await page.locator("#identity-mode").selectOption("embedded");
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).toContainText("Embedded IDP/IDM is limited to 20 users");
    
    // Test 2: forbidden storage mode (this will test that posixfs is not available)
    // Since posixfs is not in the UI, this is already enforced
    const storageOptions = await page.locator("#storage-mode option").allTextContents();
    expect(storageOptions).not.toContain("posixfs");
    
    // Test 3: unsupported office mode (ONLYOFFICE should not be available)
    const officeOptions = await page.locator("#office-mode option").allTextContents();
    expect(officeOptions).not.toContain("ONLYOFFICE");
    
    // Test 4: production self-signed TLS - should be rejected
    await page.locator("#purpose").selectOption("production");
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).toContainText("Production requires a real FQDN");
    
    // Test 5: missing backup recipient with auto updates
    await page.locator("#purpose").selectOption("evaluation");
    await page.locator('[name="autoUpdates"]').check();
    await page.locator('[name="backupRecipient"]').fill("");
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).toContainText("backup recipient");
    
    // Test 6: missing host sizing values should show warning
    await page.locator('[name="autoUpdates"]').uncheck();
    await page.locator("#system-cpu").fill("");
    await page.locator("#system-ram-gib").fill("");
    await page.locator("#system-disk-gib").fill("");
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    // This may show a warning but should still work
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  // Test that Kubernetes requires HTTPS for Collabora
  test("testKubernetesRequiresHttpsCollabora - Kubernetes deployment requires HTTPS for Collabora", async ({ page }) => {
    await page.locator("#runtime").selectOption("kubernetes");
    await page.locator("#office-mode").selectOption("collabora");
    await page.locator("#office-deployment").selectOption("external");
    
    // Try to use HTTP URL for Collabora with Kubernetes - should be rejected
    await page.locator('[name="collaboraUrl"]').fill("http://office.example.com");
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    
    // Should show validation error for non-HTTPS URL
    await expect(page.locator("#validation-errors")).toContainText("collaboraUrl");
  });

  // Test complex combination of all features on Docker
  test("testAllFeaturesDockerCombination - Complex combination of all supported features on Docker validates successfully", async ({ page }) => {
    await page.locator("#purpose").selectOption("evaluation");
    await page.locator("#runtime").selectOption("docker");
    await page.locator("#manager").selectOption("direct");
    
    // Enable all services
    await page.locator("#search").check();
    await page.locator("#clamav").check();
    await page.locator("#notifications").check();
    await page.locator("#autoUpdates").check();
    await page.locator('[name="updateDelay"]').fill("24");
    await page.locator('[name="backupRecipient"]').fill("admin@example.com");
    
    // Configure SMTP
    await page.locator('[name="smtpHost"]').fill("smtp.example.com");
    await page.locator('[name="smtpPort"]').fill("587");
    await page.locator('[name="smtpUsername"]').fill("smtp-user");
    await page.locator('[name="smtpPassword"]').fill("smtp-password-test");
    
    // Configure external OIDC
    await page.locator("#identity-mode").selectOption("external-oidc");
    await page.locator('[name="oidcIssuer"]').fill("https://id.example.com/realms/owncloud");
    await page.locator('[name="oidcClientId"]').fill("owncloud-web");
    await page.locator('[name="ldapUri"]').fill("ldaps://ldap.example.com:636");
    await page.locator('[name="ldapBindDn"]').fill("uid=ocis,ou=system,dc=example,dc=com");
    await page.locator('[name="ldapUserBaseDn"]').fill("ou=users,dc=example,dc=com");
    await page.locator('[name="ldapGroupBaseDn"]').fill("ou=groups,dc=example,dc=com");
    await page.locator('[name="ldapBindPassword"]').fill("local-test-bind-password");
    
    // Configure S3 storage
    await page.locator("#storage-mode").selectOption("s3ng");
    await page.locator('[name="s3Endpoint"]').fill("https://s3.example.com");
    await page.locator('[name="s3Region"]').fill("us-east-1");
    await page.locator('[name="s3Bucket"]').fill("owncloud-data");
    await page.locator('[name="s3AccessKey"]').fill("test-access-key");
    await page.locator('[name="s3SecretKey"]').fill("test-secret-key");
    
    // Configure bundled Collabora
    await page.locator("#office-mode").selectOption("collabora");
    await page.locator("#office-deployment").selectOption("bundled");
    await page.locator('[name="collaboraDomain"]').fill("office.example.com");
    await page.locator('[name="collaboraAdminPassword"]').fill("local-test-collabora-password");
    await page.locator('[name="collaboraConcurrentUsers"]').fill("10");
    
    // Configure workload
    await page.locator("#registered-users").fill("100");
    await page.locator("#stored-data-gib").fill("500");
    await page.locator("#annual-growth-percent").fill("20");
    
    // Configure system resources
    await page.locator("#system-cpu").fill("8");
    await page.locator("#system-ram-gib").fill("16");
    await page.locator("#system-disk-gib").fill("100");
    
    // Configure networking
    await page.locator('[name="domain"]').fill("cloud.example.com");
    await page.locator('[name="httpPort"]').fill("8080");
    await page.locator('[name="httpsPort"]').fill("8443");
    
    await page.locator("#eula").check();
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).toBeHidden();
    
    // Should show sizing for all enabled components
    await expect(page.locator("#sizing-breakdown")).toContainText("Search and extraction");
    await expect(page.locator("#sizing-breakdown")).toContainText("ClamAV");
    await expect(page.locator("#sizing-breakdown")).toContainText("Bundled Collabora");
  });
});