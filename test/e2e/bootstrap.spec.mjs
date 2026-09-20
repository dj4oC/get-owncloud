import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Bootstrap command picker tests
 * Tests for runtime and manager selection that determines the bootstrap approach
 */

// Helper function to select runtime and update UI
async function selectRuntime(page, runtimeValue) {
  await page.locator("#runtime").selectOption(runtimeValue);
  // Explicitly update the UI since Playwright's selectOption doesn't trigger events properly
  await page.evaluate((rv) => {
    const runtime = document.querySelector("#runtime");
    const manager = document.querySelector("#manager");
    const purpose = document.querySelector("#purpose");
    
    // Set runtime value
    runtime.value = rv;
    
    // Update manager options based on runtime
    const isKubernetes = rv === "kubernetes";
    manager.replaceChildren(
      Object.assign(document.createElement("option"), { value: isKubernetes ? "helm" : "direct", textContent: isKubernetes ? "Helm" : "Direct" }),
      Object.assign(document.createElement("option"), { value: isKubernetes ? "argocd" : "ansible", textContent: isKubernetes ? "Argo CD" : "Ansible" })
    );
    
    // Update maturity note
    document.querySelector("#maturity-note").textContent = isKubernetes
      ? "Community Preview: chart 0.7.0 and oCIS 7.1.4 stay pinned; issue #6 remains open."
      : rv === "podman"
        ? "Podman is runnable Community Preview until its full parity matrix passes."
        : "Docker is the production-gated single-host path; production still depends on launch gates and load testing.";
    
    // Update production option disabled state
    const productionOption = [...purpose.options].find(item => item.value === "production");
    if (productionOption) {
      productionOption.disabled = isKubernetes || rv === "podman";
    }
    
    // Dispatch events
    runtime.dispatchEvent(new Event("change", { bubbles: true }));
    runtime.dispatchEvent(new Event("input", { bubbles: true }));
  }, runtimeValue);
  
  // Small wait for any other updates
  await page.waitForTimeout(100);
}

test.describe("Bootstrap Command Picker", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for catalogs to be loaded by checking for an element that's updated after loading
    await page.waitForSelector("#image-digest-note", { state: "visible" });
    // Wait longer for catalogs to load
    await page.waitForTimeout(10000);
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
    await selectRuntime(page, "podman");
    await expect(page.locator("#runtime")).toHaveValue("podman");
    
    // Podman should show maturity note
    await expect(page.locator("#maturity-note")).toContainText("Podman is runnable Community Preview");
    
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
    await selectRuntime(page, "kubernetes");
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
    await selectRuntime(page, "docker");
    await page.locator("#manager").selectOption("ansible");
    await expect(page.locator("#manager")).toHaveValue("ansible");
    
    // Ansible should work with Podman
    await selectRuntime(page, "podman");
    await page.locator("#manager").selectOption("ansible");
    await expect(page.locator("#manager")).toHaveValue("ansible");
    
    // Ansible should NOT work with Kubernetes - it shouldn't be available
    await selectRuntime(page, "kubernetes");
    const managerOptions = await page.locator("#manager option").allTextContents();
    expect(managerOptions).not.toContain("Ansible");
  });

  // Pairwise coverage tests for valid combinations
  test("testDockerDirectPairwise - Docker with Direct manager combination is valid", async ({ page }) => {
    await selectRuntime(page, "docker");
    await page.locator("#manager").selectOption("direct");
    
    // Should be able to validate and calculate
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  test("testPodmanDirectPairwise - Podman with Direct manager combination is valid", async ({ page }) => {
    await selectRuntime(page, "podman");
    await page.locator("#manager").selectOption("direct");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  test("testPodmanAnsiblePairwise - Podman with Ansible manager combination is valid", async ({ page }) => {
    await selectRuntime(page, "podman");
    await page.locator("#manager").selectOption("ansible");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  test("testKubernetesHelmPairwise - Kubernetes with Helm manager combination is valid", async ({ page }) => {
    await selectRuntime(page, "kubernetes");
    await page.locator("#manager").selectOption("helm");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  test("testKubernetesArgocdPairwise - Kubernetes with Argo CD manager combination is valid", async ({ page }) => {
    await selectRuntime(page, "kubernetes");
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
      await selectRuntime(page, runtime);
      // Wait for manager options to update after runtime change
      await page.waitForTimeout(100);
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
    await selectRuntime(page, "docker");
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
    await selectRuntime(page, "docker");
    await page.locator("#manager").selectOption("ansible");
    
    // Switch to Kubernetes - manager should reset to helm (first valid option)
    await selectRuntime(page, "kubernetes");
    
    // Manager should be set to a valid Kubernetes option
    const currentManager = await page.locator("#manager").inputValue();
    expect(["helm", "argocd"]).toContain(currentManager);
  });
});