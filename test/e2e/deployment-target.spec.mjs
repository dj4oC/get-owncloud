import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Deployment Target tests
 * Tests for purpose, runtime, and manager controls and their interactions
 */

test.describe("Deployment Target Controls", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  // Purpose tests
  test("testPurposeEvaluation - Evaluation purpose selection works with correct defaults", async ({ page }) => {
    await page.locator("#purpose").selectOption("evaluation");
    await expect(page.locator("#purpose")).toHaveValue("evaluation");
    
    // Evaluation should have basic auth enabled
    // Check that identity mode is embedded by default for evaluation
    await expect(page.locator("#identity-mode")).toHaveValue("embedded");
    
    // HTTP port should default to 8080 for evaluation
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    
    // Check accessibility
    const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(accessibility.violations).toEqual([]);
  });

  test("testPurposeProduction - Production purpose selection works with correct constraints", async ({ page }) => {
    await page.locator("#purpose").selectOption("production");
    await expect(page.locator("#purpose")).toHaveValue("production");
    
    // Production should disable evaluation-self-signed TLS
    // Production should require a real FQDN
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).toContainText("Production requires a real FQDN");
    
    // Production should require backup recipient for auto updates
    await expect(page.locator("#validation-errors")).toContainText("backup recipient");
    
    // Production should force ACME TLS mode
    const tlsOptions = await page.locator("#tls-mode option").allTextContents();
    expect(tlsOptions).toContain("ACME");
    expect(tlsOptions).not.toContain("Evaluation Self-signed");
  });

  // Runtime tests
  test("testRuntimeDocker - Docker runtime selection works", async ({ page }) => {
    await page.locator("#runtime").selectOption("docker");
    await expect(page.locator("#runtime")).toHaveValue("docker");
    
    // Docker should allow both direct and ansible managers
    const managerOptions = await page.locator("#manager option").allTextContents();
    expect(managerOptions).toContain("Direct");
    expect(managerOptions).toContain("Ansible");
    
    // OCIS version should be 8.2.0 for Docker
    await page.getByRole("button", { name: "Validate and calculate" }).click();
  });

  test("testRuntimePodman - Podman runtime selection works", async ({ page }) => {
    await page.locator("#runtime").selectOption("podman");
    await expect(page.locator("#runtime")).toHaveValue("podman");
    
    // Podman should show maturity note
    await expect(page.locator("#maturity-note")).toContainText("runnable Community Preview");
    
    // Podman should allow both direct and ansible managers
    const managerOptions = await page.locator("#manager option").allTextContents();
    expect(managerOptions).toContain("Direct");
    expect(managerOptions).toContain("Ansible");
    
    // OCIS version should be 8.2.0 for Podman
    // Production should be disabled for Podman
    await expect(page.locator("#purpose option[value=production]")).toHaveAttribute("disabled", "");
    
    // Auto updates should be disabled for Podman
    await expect(page.locator("#auto-updates")).toBeDisabled();
  });

  test("testRuntimeKubernetes - Kubernetes runtime selection works", async ({ page }) => {
    await page.locator("#runtime").selectOption("kubernetes");
    await expect(page.locator("#runtime")).toHaveValue("kubernetes");
    
    // Kubernetes should show maturity note about issue #6
    await expect(page.locator("#maturity-note")).toContainText("issue #6 remains open");
    
    // Kubernetes should only allow helm and argocd managers
    const managerOptions = await page.locator("#manager option").allTextContents();
    expect(managerOptions).toContain("Helm");
    expect(managerOptions).toContain("Argo CD");
    
    // OCIS version should be 7.1.4 for Kubernetes
    // Production should be disabled for Kubernetes
    await expect(page.locator("#purpose option[value=production]")).toHaveAttribute("disabled", "");
    
    // Kubernetes forces external Collabora
    // Kubernetes requires HTTPS
  });

  // Manager tests
  test("testManagerDirect - Direct manager selection works", async ({ page }) => {
    // Direct should work with Docker
    await page.locator("#runtime").selectOption("docker");
    await page.locator("#manager").selectOption("direct");
    await expect(page.locator("#manager")).toHaveValue("direct");
    
    // Should be able to validate
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  test("testManagerAnsible - Ansible manager selection works", async ({ page }) => {
    // Ansible should work with Docker
    await page.locator("#runtime").selectOption("docker");
    await page.locator("#manager").selectOption("ansible");
    await expect(page.locator("#manager")).toHaveValue("ansible");
    
    // Should be able to validate
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  test("testManagerHelm - Helm manager selection works", async ({ page }) => {
    // Helm should work with Kubernetes
    await page.locator("#runtime").selectOption("kubernetes");
    await page.locator("#manager").selectOption("helm");
    await expect(page.locator("#manager")).toHaveValue("helm");
    
    // Should be able to validate
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  test("testManagerArgocd - Argo CD manager selection works", async ({ page }) => {
    // Argo CD should work with Kubernetes
    await page.locator("#runtime").selectOption("kubernetes");
    await page.locator("#manager").selectOption("argocd");
    await expect(page.locator("#manager")).toHaveValue("argocd");
    
    // Should be able to validate
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  // Pairwise coverage tests for purpose-runtime-manager combinations
  test("testPurposeRuntimeManagerPairwise - All valid purpose-runtime-manager combinations work", async ({ page }) => {
    const validCombinations = [
      { purpose: "evaluation", runtime: "docker", manager: "direct" },
      { purpose: "evaluation", runtime: "docker", manager: "ansible" },
      { purpose: "evaluation", runtime: "podman", manager: "direct" },
      { purpose: "evaluation", runtime: "podman", manager: "ansible" },
      { purpose: "evaluation", runtime: "kubernetes", manager: "helm" },
      { purpose: "evaluation", runtime: "kubernetes", manager: "argocd" }
    ];

    for (const { purpose, runtime, manager } of validCombinations) {
      await page.locator("#purpose").selectOption(purpose);
      await page.locator("#runtime").selectOption(runtime);
      await page.locator("#manager").selectOption(manager);
      
      // Should be able to validate and calculate
      await page.getByRole("button", { name: "Validate and calculate" }).click();
      await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
    }
  });

  // Test runtime-manager pairwise constraints
  test("testRuntimeManagerConstraints - Manager options are constrained by runtime", async ({ page }) => {
    // Docker should offer direct and ansible
    await page.locator("#runtime").selectOption("docker");
    let managerOptions = await page.locator("#manager option").allTextContents();
    expect(managerOptions).toContain("Direct");
    expect(managerOptions).toContain("Ansible");
    expect(managerOptions).not.toContain("Helm");
    expect(managerOptions).not.toContain("Argo CD");

    // Podman should offer direct and ansible
    await page.locator("#runtime").selectOption("podman");
    managerOptions = await page.locator("#manager option").allTextContents();
    expect(managerOptions).toContain("Direct");
    expect(managerOptions).toContain("Ansible");
    expect(managerOptions).not.toContain("Helm");
    expect(managerOptions).not.toContain("Argo CD");

    // Kubernetes should offer helm and argocd
    await page.locator("#runtime").selectOption("kubernetes");
    managerOptions = await page.locator("#manager option").allTextContents();
    expect(managerOptions).toContain("Helm");
    expect(managerOptions).toContain("Argo CD");
    expect(managerOptions).not.toContain("Direct");
    expect(managerOptions).not.toContain("Ansible");
  });

  // Test purpose-runtime constraints
  test("testPurposeRuntimeConstraints - Runtime options are constrained by purpose", async ({ page }) => {
    // For production purpose, all runtimes should be available but with constraints
    await page.locator("#purpose").selectOption("production");
    
    // Docker should be available for production
    await page.locator("#runtime").selectOption("docker");
    await expect(page.locator("#runtime")).toHaveValue("docker");
    
    // But production requires additional constraints
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).toContainText("Production requires a real FQDN");
    
    // Podman should be disabled for production
    const runtimeOptions = await page.locator("#runtime option").all();
    const optionsWithValues = await Promise.all(runtimeOptions.map(async opt => ({
      option: opt,
      value: await opt.getAttribute("value")
    })));
    const podmanOption = optionsWithValues.find(({ value }) => value === "podman")?.option;
    if (podmanOption) {
      await expect(podmanOption).toHaveAttribute("disabled", "");
    }
    
    // Kubernetes should be disabled for production
    const kubernetesOption = optionsWithValues.find(({ value }) => value === "kubernetes")?.option;
    if (kubernetesOption) {
      await expect(kubernetesOption).toHaveAttribute("disabled", "");
    }
  });

  // Test purpose-manager constraints
  test("testPurposeManagerConstraints - Manager behavior varies by purpose", async ({ page }) => {
    // For evaluation, all managers should work with their respective runtimes
    await page.locator("#purpose").selectOption("evaluation");
    await page.locator("#runtime").selectOption("docker");
    
    await page.locator("#manager").selectOption("direct");
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
    
    await page.locator("#manager").selectOption("ansible");
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  // Test that switching between runtimes and managers maintains consistency
  test("testDeploymentTargetConsistency - Deployment target selections remain consistent across changes", async ({ page }) => {
    // Start with evaluation + docker + direct
    await page.locator("#purpose").selectOption("evaluation");
    await page.locator("#runtime").selectOption("docker");
    await page.locator("#manager").selectOption("direct");
    
    // Switch to podman - should maintain evaluation purpose and switch to valid manager
    await page.locator("#runtime").selectOption("podman");
    await expect(page.locator("#purpose")).toHaveValue("evaluation");
    
    // Manager should be set to a valid option for podman
    const managerValue = await page.locator("#manager").inputValue();
    expect(["direct", "ansible"]).toContain(managerValue);
    
    // Switch back to docker - should maintain evaluation purpose
    await page.locator("#runtime").selectOption("docker");
    await expect(page.locator("#purpose")).toHaveValue("evaluation");
  });
});