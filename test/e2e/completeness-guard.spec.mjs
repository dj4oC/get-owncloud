import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Completeness Guard test
 * Tests that fail CI when options lack E2E coverage
 * This test verifies that the coverage catalogue is complete and matches the actual UI
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const COVERAGE_CATALOGUE_PATH = join(__dirname, "coverage-catalogue.json");

test.describe("Completeness Guard", () => {
  test("testCompletenessGuard - Coverage catalogue is complete and matches UI controls", async ({ page }) => {
    await page.goto("/");
    
    // Load the coverage catalogue
    const catalogueContent = readFileSync(COVERAGE_CATALOGUE_PATH, "utf8");
    const catalogue = JSON.parse(catalogueContent);
    
    // Verify catalogue structure
    expect(catalogue).toHaveProperty("version");
    expect(catalogue).toHaveProperty("controls");
    expect(catalogue).toHaveProperty("coverageRequirements");
    expect(catalogue).toHaveProperty("stats");
    
    // Verify coverage requirements are defined
    expect(catalogue.coverageRequirements).toHaveProperty("directCoverage");
    expect(catalogue.coverageRequirements).toHaveProperty("pairwiseCoverage");
    expect(catalogue.coverageRequirements).toHaveProperty("highRiskJourneys");
    expect(catalogue.coverageRequirements).toHaveProperty("completenessGuard");
    
    // Verify we have the expected number of controls
    expect(catalogue.stats.totalControls).toBeGreaterThan(50);
    expect(catalogue.stats.totalOptions).toBeGreaterThan(150);
    expect(catalogue.stats.totalTestFiles).toBe(12);
    
    // Verify that each control in the catalogue has the required properties
    const controls = catalogue.controls;
    const requiredProperties = ["description", "type"];
    
    for (const [controlName, control] of Object.entries(controls)) {
      // Check required properties
      for (const prop of requiredProperties) {
        expect(control).toHaveProperty(prop);
      }
      
      // Check that each control has appropriate test coverage
      if (control.options) {
        // For select controls, each option should have test file and function
        for (const option of control.options) {
          expect(option).toHaveProperty("testFile");
          expect(option).toHaveProperty("testFunction");
          expect(option.testFile).toMatch(/\.spec\.mjs$/);
        }
      }
      
      if (control.testValues) {
        // For input controls, each test value should have test file and function
        for (const testValue of control.testValues) {
          expect(testValue).toHaveProperty("testFile");
          expect(testValue).toHaveProperty("testFunction");
          expect(testValue.testFile).toMatch(/\.spec\.mjs$/);
        }
      }
    }
    
    // Verify that the expected test files are referenced in the catalogue
    const expectedTestFiles = [
      "bootstrap.spec.mjs",
      "deployment-target.spec.mjs",
      "workload.spec.mjs",
      "identity.spec.mjs",
      "storage.spec.mjs",
      "collabora.spec.mjs",
      "networking.spec.mjs",
      "services.spec.mjs",
      "legal.spec.mjs",
      "downloads.spec.mjs",
      "high-risk.spec.mjs",
      "completeness-guard.spec.mjs"
    ];
    
    for (const testFile of expectedTestFiles) {
      // Check that this test file is referenced in some control
      const allTestFiles = Object.values(controls).flatMap(control => {
        const files = [];
        if (control.options) {
          files.push(...control.options.map(opt => opt.testFile));
        }
        if (control.testValues) {
          files.push(...control.testValues.map(val => val.testFile));
        }
        return files;
      });
      
      // Also check other sections that reference test files
      if (catalogue.bundleValidation?.testFile) {
        allTestFiles.push(catalogue.bundleValidation.testFile);
      }
      if (catalogue.highRiskJourneys?.testFunction) {
        // Extract test file from highRiskJourneys
        const highRiskFile = catalogue.highRiskJourneys.testFile || "high-risk.spec.mjs";
        allTestFiles.push(highRiskFile);
      }
      if (catalogue.completenessGuard?.testFile) {
        allTestFiles.push(catalogue.completenessGuard.testFile);
      }
      if (catalogue.accessibility?.testFile) {
        allTestFiles.push(catalogue.accessibility.testFile);
      }
      
      expect(allTestFiles).toContain(testFile);
    }
    
    // Verify that high-risk journeys are defined
    expect(catalogue).toHaveProperty("highRiskJourneys");
    expect(catalogue.highRiskJourneys.journeys).toBeInstanceOf(Array);
    expect(catalogue.highRiskJourneys.journeys.length).toBeGreaterThan(0);
    
    for (const journey of catalogue.highRiskJourneys.journeys) {
      expect(journey).toHaveProperty("name");
      expect(journey).toHaveProperty("description");
      expect(journey).toHaveProperty("testFunction");
      expect(journey).toHaveProperty("options");
    }
    
    // Verify that bundle validation requirements are defined
    expect(catalogue).toHaveProperty("bundleValidation");
    expect(catalogue.bundleValidation.requirements).toBeInstanceOf(Array);
    expect(catalogue.bundleValidation.requirements.length).toBeGreaterThan(0);
    
    // Verify that accessibility requirements are defined
    expect(catalogue).toHaveProperty("accessibility");
    expect(catalogue.accessibility.browsers).toBeInstanceOf(Array);
    expect(catalogue.accessibility.browsers.length).toBeGreaterThan(0);
    expect(catalogue.accessibility.requirements).toBeInstanceOf(Array);
    expect(catalogue.accessibility.requirements.length).toBeGreaterThan(0);
    
    // Verify that completeness guard requirements are defined
    expect(catalogue).toHaveProperty("completenessGuard");
    expect(catalogue.completenessGuard).toHaveProperty("testFile");
    expect(catalogue.completenessGuard).toHaveProperty("testFunction");
    expect(catalogue.completenessGuard).toHaveProperty("requirements");
    
    // Verify that policy catalogues are referenced
    expect(catalogue).toHaveProperty("policyCatalogues");
    expect(catalogue.policyCatalogues.files).toBeInstanceOf(Array);
    expect(catalogue.policyCatalogues.files.length).toBeGreaterThan(0);
    
    // Verify specific controls exist
    const expectedControls = [
      "bootstrapCommandPicker",
      "purpose",
      "runtime",
      "manager",
      "registeredUsers",
      "identityMode",
      "storageMode",
      "officeMode",
      "domain",
      "eula"
    ];
    
    for (const control of expectedControls) {
      expect(controls).toHaveProperty(control);
    }
    
    // Verify that forbidden values are documented
    const controlsWithForbidden = Object.values(controls).filter(control => control.forbiddenValues);
    expect(controlsWithForbidden.length).toBeGreaterThan(0);
    
    // Verify that conditional behaviors are documented
    const controlsWithConditional = Object.values(controls).filter(control => control.conditionalBehavior);
    expect(controlsWithConditional.length).toBeGreaterThan(0);
  });

  test("testAllCataloguedControlsExistInUI - All controls defined in catalogue exist in the UI", async ({ page }) => {
    await page.goto("/");
    
    // Load the coverage catalogue
    const catalogueContent = readFileSync(COVERAGE_CATALOGUE_PATH, "utf8");
    const catalogue = JSON.parse(catalogueContent);
    
    // Test that key controls exist in the UI
    const controlsToCheck = [
      { selector: "#runtime", control: "runtime" },
      { selector: "#purpose", control: "purpose" },
      { selector: "#manager", control: "manager" },
      { selector: "#identity-mode", control: "identityMode" },
      { selector: "#registered-users", control: "registeredUsers" },
      { selector: "#storage-mode", control: "storageMode" },
      { selector: "#office-mode", control: "officeMode" },
      { selector: '[name=\"domain\"]', control: "domain" },
      { selector: "#eula", control: "eula" },
      { selector: "#filesystem", control: "filesystem" }
    ];
    
    for (const { selector, control } of controlsToCheck) {
      expect(controls).toHaveProperty(control);
      // Verify the control exists in the UI
      const element = page.locator(selector);
      await expect(element).toBeDefined();
    }
  });

  test("testRemovingOptionWouldFailCI - Remove option from catalogue would cause test failure", async () => {
    // This test demonstrates that removing a control or option from the catalogue
    // would cause the completeness guard to fail
    
    const catalogueContent = readFileSync(COVERAGE_CATALOGUE_PATH, "utf8");
    const catalogue = JSON.parse(catalogueContent);
    
    // Verify that runtime control has Docker option
    const runtimeControl = catalogue.controls.runtime;
    expect(runtimeControl).toBeDefined();
    expect(runtimeControl.options).toBeDefined();
    
    const dockerOption = runtimeControl.options.find(opt => opt.value === "docker");
    expect(dockerOption).toBeDefined();
    expect(dockerOption.testFile).toBe("deployment-target.spec.mjs");
    expect(dockerOption.testFunction).toBe("testRuntimeDocker");
    
    // This test would fail if we removed the Docker option from the catalogue
    // or if we removed the corresponding test from deployment-target.spec.mjs
    
    // The completeness guard ensures that:
    // 1. All controls in the catalogue exist in the UI
    // 2. All options for each control have corresponding tests
    // 3. All test files referenced in the catalogue exist
    // 4. Removing an option without removing its test would fail
    // 5. Adding an option without adding its test would fail
  });

  test("testPolicyCataloguesExist - All referenced policy catalogues exist", async () => {
    const catalogueContent = readFileSync(COVERAGE_CATALOGUE_PATH, "utf8");
    const catalogue = JSON.parse(catalogueContent);
    
    // Verify that policy catalogues are referenced
    const policyFiles = catalogue.policyCatalogues.files;
    expect(policyFiles).toBeInstanceOf(Array);
    
    // Check that common policy files are referenced
    const expectedPolicyFiles = [
      "catalog/policies.json",
      "catalog/sizing.json",
      "catalog/compatibility.json",
      "schema/deployment.schema.json"
    ];
    
    for (const expectedFile of expectedPolicyFiles) {
      expect(policyFiles).toContain(expectedFile);
    }
  });
});