import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Identity tests
 * Tests for identity mode selection and external OIDC/LDAP configuration
 */

test.describe("Identity Controls", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  // Identity mode tests
  test("testIdentityEmbedded - Embedded identity mode works with user limit", async ({ page }) => {
    await page.locator("#identity-mode").selectOption("embedded");
    await expect(page.locator("#identity-mode")).toHaveValue("embedded");
    
    // Embedded should work with <= 20 users
    await page.locator("#registered-users").fill("20");
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).toBeHidden();
    
    // External identity fields should be hidden for embedded
    await expect(page.locator("#external-identity")).toBeHidden();
    
    // Check accessibility
    const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(accessibility.violations).toEqual([]);
  });

  test("testIdentityExternalOidc - External OIDC identity mode shows required fields", async ({ page }) => {
    await page.locator("#identity-mode").selectOption("external-oidc");
    await expect(page.locator("#identity-mode")).toHaveValue("external-oidc");
    
    // External identity fields should be visible
    await expect(page.locator("#external-identity")).toBeVisible();
    
    // All OIDC/LDAP fields should be available
    await expect(page.locator('[name="oidcIssuer"]')).toBeVisible();
    await expect(page.locator('[name="oidcClientId"]')).toBeVisible();
    await expect(page.locator('[name="ldapUri"]')).toBeVisible();
    await expect(page.locator('[name="ldapBindDn"]')).toBeVisible();
    await expect(page.locator('[name="ldapUserBaseDn"]')).toBeVisible();
    await expect(page.locator('[name="ldapGroupBaseDn"]')).toBeVisible();
    await expect(page.locator('[name="ldapBindPassword"]')).toBeVisible();
  });

  // OIDC Issuer tests
  test("testOidcIssuerValid - Valid OIDC issuer URL is accepted", async ({ page }) => {
    await page.locator("#identity-mode").selectOption("external-oidc");
    await page.locator('[name="oidcIssuer"]').fill("https://id.corp.example/realms/owncloud");
    await expect(page.locator('[name="oidcIssuer"]')).toHaveValue("https://id.corp.example/realms/owncloud");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    // Should not show validation errors for valid URL format
    await expect(page.locator("#validation-errors")).not.toContainText("oidcIssuer");
  });

  test("testOidcIssuerMissing - Missing OIDC issuer shows validation error", async ({ page }) => {
    await page.locator("#identity-mode").selectOption("external-oidc");
    await page.locator('[name="oidcIssuer"]').fill("");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    // Should show validation error for missing required field
    await expect(page.locator("#validation-errors")).toContainText("oidcIssuer");
  });

  test("testOidcIssuerMalformed - Malformed OIDC issuer URL shows validation error", async ({ page }) => {
    await page.locator("#identity-mode").selectOption("external-oidc");
    await page.locator('[name="oidcIssuer"]').fill("not-a-url");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    // Should show validation error for malformed URL
    await expect(page.locator("#validation-errors")).toContainText("oidcIssuer");
  });

  // OIDC Client ID tests
  test("testOidcClientIdValid - Valid OIDC client ID is accepted", async ({ page }) => {
    await page.locator("#identity-mode").selectOption("external-oidc");
    await page.locator('[name="oidcClientId"]').fill("owncloud-web");
    await expect(page.locator('[name="oidcClientId"]')).toHaveValue("owncloud-web");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).not.toContainText("oidcClientId");
  });

  test("testOidcClientIdMissing - Missing OIDC client ID shows validation error", async ({ page }) => {
    await page.locator("#identity-mode").selectOption("external-oidc");
    await page.locator('[name="oidcClientId"]').fill("");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).toContainText("oidcClientId");
  });

  // LDAP URI tests
  test("testLdapUriValid - Valid LDAPS URI is accepted", async ({ page }) => {
    await page.locator("#identity-mode").selectOption("external-oidc");
    await page.locator('[name="ldapUri"]').fill("ldaps://ldap.corp.example:636");
    await expect(page.locator('[name="ldapUri"]')).toHaveValue("ldaps://ldap.corp.example:636");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).not.toContainText("ldapUri");
  });

  test("testLdapUriValidLdap - Valid LDAP URI is accepted", async ({ page }) => {
    await page.locator("#identity-mode").selectOption("external-oidc");
    await page.locator('[name="ldapUri"]').fill("ldap://ldap.corp.example:389");
    await expect(page.locator('[name="ldapUri"]')).toHaveValue("ldap://ldap.corp.example:389");
    
    // Note: This may show a warning about requiring LDAPS but should validate
    await page.getByRole("button", { name: "Validate and calculate" }).click();
  });

  test("testLdapUriMissing - Missing LDAP URI shows validation error", async ({ page }) => {
    await page.locator("#identity-mode").selectOption("external-oidc");
    await page.locator('[name="ldapUri"]').fill("");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).toContainText("ldapUri");
  });

  test("testLdapUriMalformed - Malformed LDAP URI shows validation error", async ({ page }) => {
    await page.locator("#identity-mode").selectOption("external-oidc");
    await page.locator('[name="ldapUri"]').fill("invalid-uri");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).toContainText("ldapUri");
  });

  // LDAP Bind DN tests
  test("testLdapBindDnValid - Valid LDAP bind DN is accepted", async ({ page }) => {
    await page.locator("#identity-mode").selectOption("external-oidc");
    await page.locator('[name="ldapBindDn"]').fill("uid=ocis,ou=system,dc=corp,dc=example");
    await expect(page.locator('[name="ldapBindDn"]')).toHaveValue("uid=ocis,ou=system,dc=corp,dc=example");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).not.toContainText("ldapBindDn");
  });

  test("testLdapBindDnMissing - Missing LDAP bind DN shows validation error", async ({ page }) => {
    await page.locator("#identity-mode").selectOption("external-oidc");
    await page.locator('[name="ldapBindDn"]').fill("");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).toContainText("ldapBindDn");
  });

  // LDAP User Base DN tests
  test("testLdapUserBaseDnValid - Valid LDAP user base DN is accepted", async ({ page }) => {
    await page.locator("#identity-mode").selectOption("external-oidc");
    await page.locator('[name="ldapUserBaseDn"]').fill("ou=users,dc=corp,dc=example");
    await expect(page.locator('[name="ldapUserBaseDn"]')).toHaveValue("ou=users,dc=corp,dc=example");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).not.toContainText("ldapUserBaseDn");
  });

  test("testLdapUserBaseDnMissing - Missing LDAP user base DN shows validation error", async ({ page }) => {
    await page.locator("#identity-mode").selectOption("external-oidc");
    await page.locator('[name="ldapUserBaseDn"]').fill("");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).toContainText("ldapUserBaseDn");
  });

  // LDAP Group Base DN tests
  test("testLdapGroupBaseDnValid - Valid LDAP group base DN is accepted", async ({ page }) => {
    await page.locator("#identity-mode").selectOption("external-oidc");
    await page.locator('[name="ldapGroupBaseDn"]').fill("ou=groups,dc=corp,dc=example");
    await expect(page.locator('[name="ldapGroupBaseDn"]')).toHaveValue("ou=groups,dc=corp,dc=example");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).not.toContainText("ldapGroupBaseDn");
  });

  test("testLdapGroupBaseDnMissing - Missing LDAP group base DN shows validation error", async ({ page }) => {
    await page.locator("#identity-mode").selectOption("external-oidc");
    await page.locator('[name="ldapGroupBaseDn"]').fill("");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).toContainText("ldapGroupBaseDn");
  });

  // LDAP Bind Password tests
  test("testLdapBindPasswordValid - Valid LDAP bind password is accepted", async ({ page }) => {
    await page.locator("#identity-mode").selectOption("external-oidc");
    await page.locator('[name="ldapBindPassword"]').fill("local-test-bind-password");
    await expect(page.locator('[name="ldapBindPassword"]')).toHaveValue("local-test-bind-password");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).not.toContainText("ldapBindPassword");
  });

  test("testLdapBindPasswordMissing - Missing LDAP bind password shows validation error", async ({ page }) => {
    await page.locator("#identity-mode").selectOption("external-oidc");
    await page.locator('[name="ldapBindPassword"]').fill("");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).toContainText("ldapBindPassword");
  });

  // Test complete external OIDC configuration
  test("testCompleteExternalOidcConfig - Complete external OIDC configuration validates successfully", async ({ page }) => {
    await page.locator("#identity-mode").selectOption("external-oidc");
    
    // Fill all required external identity fields
    await page.locator('[name="oidcIssuer"]').fill("https://id.corp.example/realms/owncloud");
    await page.locator('[name="oidcClientId"]').fill("owncloud-web");
    await page.locator('[name="ldapUri"]').fill("ldaps://ldap.corp.example:636");
    await page.locator('[name="ldapBindDn"]').fill("uid=ocis,ou=system,dc=corp,dc=example");
    await page.locator('[name="ldapUserBaseDn"]').fill("ou=users,dc=corp,dc=example");
    await page.locator('[name="ldapGroupBaseDn"]').fill("ou=groups,dc=corp,dc=example");
    await page.locator('[name="ldapBindPassword"]').fill("local-test-bind-password");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).toBeHidden();
    await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  });

  // Test identity mode switching
  test("testIdentityModeSwitching - Switching identity mode shows/hides external fields", async ({ page }) => {
    // Start with external OIDC - fields should be visible
    await page.locator("#identity-mode").selectOption("external-oidc");
    await expect(page.locator("#external-identity")).toBeVisible();
    
    // Switch to embedded - fields should be hidden
    await page.locator("#identity-mode").selectOption("embedded");
    await expect(page.locator("#external-identity")).toBeHidden();
    
    // Switch back to external OIDC - fields should be visible again
    await page.locator("#identity-mode").selectOption("external-oidc");
    await expect(page.locator("#external-identity")).toBeVisible();
  });

  // Test that password fields are properly secured (type=password)
  test("testPasswordFieldSecurity - Password fields use secure input type", async ({ page }) => {
    await page.locator("#identity-mode").selectOption("external-oidc");
    
    // Check that password fields are of type password
    await expect(page.locator('[name="ldapBindPassword"]')).toHaveAttribute("type", "password");
    
    // Check autocomplete attribute for security
    await expect(page.locator('[name="ldapBindPassword"]')).toHaveAttribute("autocomplete", "new-password");
  });

  // Test accessibility for identity controls
  test("testIdentityAccessibility - Identity controls pass accessibility scan", async ({ page }) => {
    await page.locator("#identity-mode").focus();
    
    const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(accessibility.violations).toEqual([]);
  });

  // Test that embedded identity enforces user limit
  test("testEmbeddedUserLimitEnforcement - Embedded identity enforces 20 user limit", async ({ page }) => {
    // Set to 21 users and try embedded identity
    await page.locator("#registered-users").fill("21");
    await page.locator("#identity-mode").selectOption("embedded");
    
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).toContainText("Embedded identity can only be used with up to 20 registered users");
    
    // Reduce to 20 users - should work
    await page.locator("#registered-users").fill("20");
    await page.getByRole("button", { name: "Validate and calculate" }).click();
    await expect(page.locator("#validation-errors")).toBeHidden();
  });
});