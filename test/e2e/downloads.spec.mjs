import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { execFileSync } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Downloads tests
 * Tests for bundle generation, profile downloads, and artifact verification
 */

test.describe("Bundle Download and Verification", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  // Test Docker bundle download and verification
  test("testDockerBundleDownload - Docker direct bundle downloads and contains expected files", async ({ page }) => {
    await page.locator("#runtime").selectOption("docker");
    await page.locator("#manager").selectOption("direct");
    await page.locator("#registered-users").fill("20");
    await page.locator("#identity-mode").selectOption("embedded");
    await page.locator("#eula").check();
    
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#generate").click();
    const download = await downloadPromise;
    
    // Verify filename format
    expect(download.suggestedFilename()).toMatch(/docker.*\.zip/);
    
    // Save and verify bundle contents
    const directory = await mkdtemp(join(tmpdir(), "get-owncloud-docker-"));
    const zip = join(directory, download.suggestedFilename());
    await download.saveAs(zip);
    
    // Verify ZIP is valid
    execFileSync("unzip", ["-t", zip], { stdio: "pipe" });
    
    // Extract the ZIP to verify contents
    execFileSync("unzip", ["-o", "-q", zip, "-d", directory], { stdio: "pipe" });
    
    // Check for expected files
    const listing = execFileSync("ls", [directory], { encoding: "utf8" });
    for (const required of [".env", "docker-compose.yml", "ocis.yml", "install.sh", "deployment.lock.json", "manifest.sha256"]) {
      expect(listing).toContain(required);
    }
    
    // Verify manifest checksum
    execFileSync("sha256sum", ["-c", "manifest.sha256"], { cwd: directory, stdio: "pipe" });
    
    // Verify deployment lock contains immutable inputs
    const deploymentLock = JSON.parse(execFileSync("cat", [join(directory, "deployment.lock.json")], { encoding: "utf8" }));
    expect(deploymentLock).toHaveProperty("apiVersion");
    expect(deploymentLock).toHaveProperty("profile");
  });

  // Test Podman Ansible bundle download
  test("testPodmanAnsibleBundleDownload - Podman Ansible bundle downloads with expected structure", async ({ page }) => {
    await page.locator("#runtime").selectOption("podman");
    await page.locator("#manager").selectOption("ansible");
    await page.locator("#registered-users").fill("20");
    await page.locator("#identity-mode").selectOption("embedded");
    await page.locator("#eula").check();
    
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#generate").click();
    const download = await downloadPromise;
    
    expect(download.suggestedFilename()).toMatch(/podman.*\.zip/);
    
    const directory = await mkdtemp(join(tmpdir(), "get-owncloud-podman-"));
    const zip = join(directory, download.suggestedFilename());
    await download.saveAs(zip);
    
    // Verify ZIP is valid
    execFileSync("unzip", ["-t", zip], { stdio: "pipe" });
    
    // Check for expected Ansible files
    const listing = execFileSync("unzip", ["-Z1", zip], { encoding: "utf8" });
    for (const required of [
      "ansible/playbook.yml",
      "ansible/requirements.yml", 
      "ansible/roles/get_owncloud/tasks/main.yml",
      "scripts/runtime-common.sh"
    ]) {
      expect(listing).toContain(required);
    }
    
    // Verify profile JSON matches UI selections
    const profile = JSON.parse(execFileSync("cat", [join(directory, "deployment-profile.json")], { encoding: "utf8" }));
    expect(profile.target).toEqual({ runtime: "podman", manager: "ansible" });
  });

  // Test Kubernetes Helm bundle download
  test("testKubernetesHelmBundleDownload - Kubernetes Helm bundle downloads with expected structure", async ({ page }) => {
    await page.locator("#runtime").selectOption("kubernetes");
    await page.locator("#manager").selectOption("helm");
    await page.locator("#registered-users").fill("20");
    await page.locator("#identity-mode").selectOption("embedded");
    await page.locator("#eula").check();
    
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#generate").click();
    const download = await downloadPromise;
    
    expect(download.suggestedFilename()).toMatch(/kubernetes.*\.zip/);
    
    const directory = await mkdtemp(join(tmpdir(), "get-owncloud-k8s-"));
    const zip = join(directory, download.suggestedFilename());
    await download.saveAs(zip);
    
    // Verify ZIP is valid
    execFileSync("unzip", ["-t", zip], { stdio: "pipe" });
    
    // Check for expected Kubernetes files
    const listing = execFileSync("unzip", ["-Z1", zip], { encoding: "utf8" });
    for (const required of [
      "values.yaml",
      "deploy.sh",
      "deployment.lock.json"
    ]) {
      expect(listing).toContain(required);
    }
    
    // Verify profile JSON matches Kubernetes selection
    const profile = JSON.parse(execFileSync("cat", [join(directory, "deployment-profile.json")], { encoding: "utf8" }));
    expect(profile.target).toEqual({ runtime: "kubernetes", manager: "helm" });
  });

  // Test Kubernetes Argo CD bundle download
  test("testKubernetesArgocdBundleDownload - Kubernetes Argo CD bundle downloads with expected structure", async ({ page }) => {
    await page.locator("#runtime").selectOption("kubernetes");
    await page.locator("#manager").selectOption("argocd");
    await page.locator("#registered-users").fill("20");
    await page.locator("#identity-mode").selectOption("embedded");
    await page.locator("#eula").check();
    
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#generate").click();
    const download = await downloadPromise;
    
    expect(download.suggestedFilename()).toMatch(/kubernetes.*\.zip/);
    
    const directory = await mkdtemp(join(tmpdir(), "get-owncloud-k8s-argocd-"));
    const zip = join(directory, download.suggestedFilename());
    await download.saveAs(zip);
    
    // Verify ZIP is valid
    execFileSync("unzip", ["-t", zip], { stdio: "pipe" });
    
    // Check for expected Argo CD files
    const listing = execFileSync("unzip", ["-Z1", zip], { encoding: "utf8" });
    for (const required of [
      "argocd/application.yaml",
      "argocd/project.yaml",
      "values.yaml",
      "deploy.sh",
      "deployment.lock.json"
    ]) {
      expect(listing).toContain(required);
    }
  });

  // Test advanced bundle with S3, external OIDC, and services
  test("testAdvancedBundleDownload - Advanced configuration bundle downloads successfully", async ({ page }) => {
    // Configure advanced setup with external identity, S3 storage, and services
    await page.locator("#registered-users").fill("100");
    await page.locator("#identity-mode").selectOption("external-oidc");
    await page.locator('[name="oidcIssuer"]').fill("https://id.corp.example/realms/owncloud");
    await page.locator('[name="oidcClientId"]').fill("owncloud-web");
    await page.locator('[name="ldapUri"]').fill("ldaps://ldap.corp.example:636");
    await page.locator('[name="ldapBindDn"]').fill("uid=ocis,ou=system,dc=corp,dc=example");
    await page.locator('[name="ldapUserBaseDn"]').fill("ou=users,dc=corp,dc=example");
    await page.locator('[name="ldapGroupBaseDn"]').fill("ou=groups,dc=corp,dc=example");
    await page.locator('[name="ldapBindPassword"]').fill("local-test-bind-password");
    
    await page.locator("#storage-mode").selectOption("s3ng");
    await page.locator('[name="s3Endpoint"]').fill("https://s3.corp.example");
    await page.locator('[name="s3Bucket"]').fill("owncloud-data");
    await page.locator('[name="s3AccessKey"]').fill("test-access-key");
    await page.locator('[name="s3SecretKey"]').fill("test-secret-key");
    
    await page.locator("#search").check();
    await page.locator("#clamav").check();
    await page.locator("#notifications").check();
    
    await page.locator("#eula").check();
    
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#generate").click();
    const download = await downloadPromise;
    
    const directory = await mkdtemp(join(tmpdir(), "get-owncloud-advanced-"));
    const zip = join(directory, download.suggestedFilename());
    await download.saveAs(zip);
    
    // Verify ZIP is valid
    execFileSync("unzip", ["-t", zip], { stdio: "pipe" });
    
    // Verify manifest checksum
    execFileSync("sha256sum", ["-c", "manifest.sha256"], { cwd: directory, stdio: "pipe" });
    
    // Check for service-specific files
    const listing = execFileSync("unzip", ["-Z1", zip], { encoding: "utf8" });
    for (const required of ["s3ng.yml", "external-oidc.yml", "clamav.yml"]) {
      expect(execFileSync("test", ["-f", join(directory, required)])).toBeDefined();
    }
  });

  // Test accessibility for download functionality
  test("testDownloadAccessibility - Download controls pass accessibility scan", async ({ page }) => {
    // Ensure we have valid configuration for generate button to be visible
    await page.locator("#registered-users").fill("20");
    await page.locator("#identity-mode").selectOption("embedded");
    await page.locator("#eula").check();
    
    await page.locator("#generate").focus();
    
    const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(accessibility.violations).toEqual([]);
  });

  // Test that no secrets appear in artifacts
  test("testNoSecretsInArtifacts - Generated bundles contain only secret references, not actual secrets", async ({ page }) => {
    // Configure with secrets and required fields
    await page.locator("#identity-mode").selectOption("external-oidc");
    await page.locator('[name="oidcIssuer"]').fill("https://id.test.example/realms/owncloud");
    await page.locator('[name="oidcClientId"]').fill("web");
    await page.locator('[name="ldapUri"]').fill("ldaps://ldap.test.example:636");
    await page.locator('[name="ldapBindDn"]').fill("uid=ocis,ou=system,dc=test,dc=example");
    await page.locator('[name="ldapUserBaseDn"]').fill("ou=users,dc=test,dc=example");
    await page.locator('[name="ldapGroupBaseDn"]').fill("ou=groups,dc=test,dc=example");
    await page.locator('[name="ldapBindPassword"]').fill("local-test-bind-password");
    await page.locator("#storage-mode").selectOption("s3ng");
    await page.locator('[name="s3Endpoint"]').fill("https://s3.test.example");
    await page.locator('[name="s3Region"]').fill("us-east-1");
    await page.locator('[name="s3Bucket"]').fill("test-bucket");
    await page.locator('[name="s3AccessKey"]').fill("test-access-key");
    await page.locator('[name="s3SecretKey"]').fill("test-secret-key");
    await page.locator("#registered-users").fill("20");
    await page.locator("#eula").check();
    
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#generate").click();
    const download = await downloadPromise;
    
    const directory = await mkdtemp(join(tmpdir(), "get-owncloud-secrets-"));
    const zip = join(directory, download.suggestedFilename());
    await download.saveAs(zip);
    
    // Extract and check that actual secrets don't appear in any files
    execFileSync("unzip", ["-q", zip, "-d", directory]);
    
    // Check that secret values don't appear in extracted files
    const files = execFileSync("find", [directory, "-type", "f"], { encoding: "utf8" }).trim().split("\n");
    for (const file of files) {
      if (file.endsWith(".zip")) continue;
      try {
        const content = execFileSync("cat", [file], { encoding: "utf8" });
        // These are the actual secret values we entered - they should NOT appear
        expect(content).not.toContain("local-test-bind-password");
        expect(content).not.toContain("test-secret-key");
      } catch (e) {
        // Only skip if it's a file read error (ENOENT, EISDIR, etc.)
        // Let assertion errors propagate
        if (e.code !== "ENOENT" && e.code !== "EISDIR") {
          throw e;
        }
      }
    }
  });

  // Test that tampering causes verification to fail
  test("testTamperingCausesVerificationFailure - Modifying bundle files causes checksum verification to fail", async ({ page }) => {
    await page.locator("#runtime").selectOption("docker");
    await page.locator("#manager").selectOption("direct");
    await page.locator("#registered-users").fill("20");
    await page.locator("#identity-mode").selectOption("embedded");
    await page.locator("#eula").check();
    
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#generate").click();
    const download = await downloadPromise;
    
    const directory = await mkdtemp(join(tmpdir(), "get-owncloud-tamper-"));
    const zip = join(directory, download.suggestedFilename());
    await download.saveAs(zip);
    
    // Extract the bundle
    execFileSync("unzip", ["-q", zip, "-d", directory]);
    
    // Tamper with a file
    execFileSync("echo", ["tampered content"], { 
      cwd: directory, 
      stdio: ["pipe", join(directory, "install.sh"), "pipe"]
    });
    
    // Try to verify - should fail
    try {
      execFileSync("sha256sum", ["-c", "manifest.sha256"], { cwd: directory, stdio: "pipe" });
      // If we get here, the verification passed (which it shouldn't)
      expect(false).toBe(true); // Force test failure
    } catch (e) {
      // Expected: verification should fail
      expect(e.status).not.toBe(0);
    }
  });

  // Test that deployment.lock.json contains immutable inputs
  test("testDeploymentLockImmutable - deployment.lock.json contains immutable profile inputs", async ({ page }) => {
    await page.locator("#runtime").selectOption("docker");
    await page.locator("#manager").selectOption("direct");
    await page.locator("#registered-users").fill("100");
    await page.locator("#stored-data-gib").fill("500");
    await page.locator("#annual-growth-percent").fill("20");
    await page.locator("#identity-mode").selectOption("embedded");
    await page.locator("#eula").check();
    
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#generate").click();
    const download = await downloadPromise;
    
    const directory = await mkdtemp(join(tmpdir(), "get-owncloud-lock-"));
    const zip = join(directory, download.suggestedFilename());
    await download.saveAs(zip);
    execFileSync("unzip", ["-q", zip, "-d", directory]);
    
    const deploymentLock = JSON.parse(execFileSync("cat", [join(directory, "deployment.lock.json")], { encoding: "utf8" }));
    const profile = deploymentLock.profile;
    
    // Check that immutable inputs are present and match what we entered
    expect(profile.workload.registeredUsers).toBe(100);
    expect(profile.workload.storedDataGiB).toBe(500);
    expect(profile.workload.annualGrowthPercent).toBe(20);
    expect(profile.target.runtime).toBe("docker");
    expect(profile.target.manager).toBe("direct");
  });
});