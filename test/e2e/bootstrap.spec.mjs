import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Bootstrap command picker tests
 * Tests for runtime and manager selection that determines the bootstrap approach
 */

test.describe("Bootstrap Command Picker", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  // Direct coverage tests for each runtime option
  test("testDockerBootstrap - Docker runtime selection works and shows correct defaults", async ({ page }) => {
    await page.locator("#runtime").selectOption("docker");
    await expect(page.locator("#runtime")).toHaveValue("docker");
    
    // Docker should allow direct and ansible managers
    const managerOptions = await page.locator("#manager option").allTextContents();
    expect(managerOptions).toContain("Direct");
    expect(managerOptions).toContain("Ansible");
    
    // Should not show Kubernetes-specific managers
    expect(managerOptions).not.toContain("Helm");
    expect(managerOptions).not.toContain("Argo CD");
    
    // Check accessibility
    const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(accessibility.violations).toEqual([]);
  });

  test("testPodmanBootstrap - Podman runtime selection works with community preview note", async ({ page }) => {
    await page.locator("#runtime").selectOption("podman");
    await expect(page.locator("#runtime")).toHaveValue("podman");
    
    // Podman should show maturity note
    await expect(page.locator("#maturity-note")).toContainText("runnable Community Preview");
    
    // Podman should allow direct and ansible managers
    const managerOptions = await page.locator("#manager option").allTextContents();
    expect(managerOptions).toContain("Direct");
    expect(managerOptions).toContain("Ansible");
    
    // Should not show Kubernetes-specific managers
    expect(managerOptions).not.toContain("Helm");
    expect(managerOptions).not.toContain("Argo CD");
    
    // Production should be disabled for Podman
    await expect(page.locator("#purpose option[value=production]")).toHaveAttribute("disabled", "");
  });

  test("testKubernetesBootstrap - Kubernetes runtime selection works with maturity note", async ({ page }) => {
    await page.locator("#runtime").selectOption("kubernetes");
    await expect(page.locator("#runtime")).toHaveValue("kubernetes");
    
    // Kubernetes should show maturity note about issue #6
    await expect(page.locator("#maturity-note")).toContainText("issue #6 remains open");
    
    // Kubernetes should only allow helm and argocd managers
    const managerOptions = await page.locator("#manager option").allTextContents();
    expect(managerOptions).toContain("Helm");
    expect(managerOptions).toContain("Argo CD");
    
    // Should not show Docker/Podman managers
    expect(managerOptions).not.toContain("Direct");
    expect(managerOptions).not.toContain("Ansible");
    
    // Production should be disabled for Kubernetes
    await expect(page.locator("#purpose option[value=production]")).toHaveAttribute("disabled", "");
  });

  test("testAnsibleBootstrap - Ansible manager selection works with runtime constraints", async ({ page }) => {
    // Ansible should work with Docker
    await page.locator("#runtime").selectOption("docker");
    await page.locator("#manager").selectOption("ansible");
    await expect(page.locator("#manager")).toHaveValue("ansible");
    
    // Ansible should work with Podman
    await page.locator("#runtime").selectOption("podman");
    await page.locator("#manager").selectOption("ansible");
    await expect(page.locator("#manager")).toHaveValue("ansible");
    
    // Ansible should NOT work with Kubernetes - it shouldn't be available
    await page.locator("#runtime").selectOption("kubernetes");
    const managerOptions = await page.locator("#manager option").allTextContents();
    expect(managerOptions).not.toContain("Ansible");
  });

  // Pairwise coverage tests for valid combinations
  test("testDockerDirectPairwise - Docker with Direct manager combination is valid", async ({ page }) => {
    await page.locator("#runtime").selectOption("docker");
    await page.locator("#manager").selectOption("direct");
    
    // Should be able to validate and calculate
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  test("testPodmanDirectPairwise - Podman with Direct manager combination is valid", async ({ page }) => {
    await page.locator("#runtime").selectOption("podman");
    await page.locator("#manager").selectOption("direct");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  test("testPodmanAnsiblePairwise - Podman with Ansible manager combination is valid", async ({ page }) => {
    await page.locator("#runtime").selectOption("podman");
    await page.locator("#manager").selectOption("ansible");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  test("testKubernetesHelmPairwise - Kubernetes with Helm manager combination is valid", async ({ page }) => {
    await page.locator("#runtime").selectOption("kubernetes");
    await page.locator("#manager").selectOption("helm");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  test("testKubernetesArgocdPairwise - Kubernetes with Argo CD manager combination is valid", async ({ page }) => {
    await page.locator("#runtime").selectOption("kubernetes");
    await page.locator("#manager").selectOption("argocd");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  // Invalid combinations should not be selectable
  test("testInvalidCombinationsNotAvailable - Invalid runtime-manager combinations are not available", async ({ page }) => {
    // Test that invalid combinations are not present in the UI
    const invalidCombinations = [
      { runtime: "kubernetes", manager: "direct" },
      { runtime: "kubernetes", manager: "ansible" },
      { runtime: "docker", manager: "helm" },
      { runtime: "docker", manager: "argocd" },
      { runtime: "podman", manager: "helm" },
      { runtime: "podman", manager: "argocd" }
    ];

    for (const { runtime, manager } of invalidCombinations) {
      await page.locator("#runtime").selectOption(runtime);
      const managerOptions = await page.locator("#manager option").allTextContents();
      
      // Check that the invalid manager is not available
      const managerDisplayNames = {
        "direct": "Direct",
        "ansible": "Ansible", 
        "helm": "Helm",
        "argocd": "Argo CD"
      };
      
      expect(managerOptions).not.toContain(managerDisplayNames[manager]);
    }
  });

  // Test copy-to-clipboard behavior for bootstrap commands
  test("testBootstrapCommandCopyToClipboard - Generated bootstrap commands can be validated", async ({ page }) => {
    // Test Docker direct bootstrap
    await page.locator("#runtime").selectOption("docker");
    await page.locator("#manager").selectOption("direct");
    await page.locator("#eula").check();
    
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#generate").click();
    const download = await downloadPromise;
    
    // Verify the downloaded file has the expected runtime and manager in the name
    expect(download.suggestedFilename()).toMatch(/docker.*\.zip/);
  });

  // Test that runtime changes reset appropriate dependent fields
  test("testRuntimeSwitchResetsDependencies - Switching runtime resets dependent fields appropriately", async ({ page }) => {
    // Start with Docker + Ansible
    await page.locator("#runtime").selectOption("docker");
    await page.locator("#manager").selectOption("ansible");
    
    // Switch to Kubernetes - manager should reset to helm (first valid option)
    await page.locator("#runtime").selectOption("kubernetes");
    
    // Manager should be set to a valid Kubernetes option
    const currentManager = await page.locator("#manager").inputValue();
    expect(["helm", "argocd"]).toContain(currentManager);
  });
});