import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { execFileSync } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("one-page configurator is accessible and downloads verified bundles", async ({ page }) => {
  const consoleErrors = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await page.goto("/");
  // Wait for catalogs to be loaded by checking for an element that's updated after loading
  await page.waitForSelector("#image-digest-note", { state: "visible" });
  await page.waitForTimeout(500);
  await expect(page).toHaveTitle(/Deploy ownCloud by Kiteworks/);
  await expect(page.locator("header img")).toHaveJSProperty("complete", true);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Deploy ownCloud by Kiteworks");
  const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(accessibility.violations).toEqual([]);

  await page.getByRole("button", { name: "Validate and calculate" }).click();
  await expect(page.locator("#sizing-breakdown")).toContainText("Calculated minimum");
  await expect(page.locator("#sizing-breakdown")).toContainText("Recommended with headroom");
  await expect(page.locator("#generate")).toBeDisabled();

  await page.locator("#registered-users").fill("21");
  await expect(page.locator("#identity-mode")).toHaveValue("external-oidc");
  await expect(page.locator("#generate-status")).toContainText("not yet valid");
  await page.locator("#registered-users").fill("20");
  await page.locator("#identity-mode").selectOption("embedded");

  await page.locator("#eula").check();
  await expect(page.locator("#generate")).toBeEnabled();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#generate").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("get-owncloud-docker-8.2.0.zip");
  const directory = await mkdtemp(join(tmpdir(), "get-owncloud-browser-"));
  const zip = join(directory, download.suggestedFilename());
  await download.saveAs(zip);
  execFileSync("unzip", ["-q", zip, "-d", directory]);
  execFileSync("sha256sum", ["-c", "manifest.sha256"], { cwd: directory, stdio: "pipe" });
  const listing = execFileSync("unzip", ["-Z1", zip], { encoding: "utf8" });
  for (const required of [".env", "docker-compose.yml", "ocis.yml", "install.sh", "deployment.lock.json"]) expect(listing).toContain(required);

  await page.locator("#runtime").selectOption("kubernetes");
  await expect(page.locator("#maturity-note")).toContainText("issue #6 remains open");
  await expect(page.locator("#purpose option[value=production]")).toHaveAttribute("disabled", "");
  await page.locator("#manager").selectOption("argocd");
  await page.getByRole("button", { name: "Validate and calculate" }).click();
  await expect(page.locator("#generate")).toBeEnabled();
  const kubernetesDownloadPromise = page.waitForEvent("download");
  await page.locator("#generate").click();
  const kubernetesDownload = await kubernetesDownloadPromise;
  expect(kubernetesDownload.suggestedFilename()).toBe("get-owncloud-kubernetes-7.1.4.zip");
  const kubernetesZip = join(directory, kubernetesDownload.suggestedFilename());
  await kubernetesDownload.saveAs(kubernetesZip);
  const kubernetesListing = execFileSync("unzip", ["-Z1", kubernetesZip], { encoding: "utf8" });
  for (const required of ["values.yaml", "deploy.sh", "deployment.lock.json", "argocd/application.yaml", "argocd/project.yaml"]) expect(kubernetesListing).toContain(required);
  expect(consoleErrors).toEqual([]);
});

test("Podman and Ansible wrapper generate the same locked single-host family", async ({ page }) => {
  await page.goto("/");
  // Wait for catalogs to be loaded by checking for an element that's updated after loading
  await page.waitForSelector("#image-digest-note", { state: "visible" });
  await page.waitForTimeout(500);
  await page.locator("#runtime").selectOption("podman");
  await expect(page.locator("#maturity-note")).toContainText("Podman is runnable Community Preview");
  await expect(page.locator("#purpose option[value=production]")).toHaveAttribute("disabled", "");
  await expect(page.locator("#auto-updates")).toBeDisabled();
  await page.locator("#manager").selectOption("ansible");
  await page.getByRole("button", { name: "Validate and calculate" }).click();
  await page.locator("#eula").check();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#generate").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("get-owncloud-podman-8.2.0.zip");
  const directory = await mkdtemp(join(tmpdir(), "get-owncloud-podman-"));
  const zip = join(directory, download.suggestedFilename());
  await download.saveAs(zip);
  execFileSync("unzip", ["-q", zip, "-d", directory]);
  execFileSync("sha256sum", ["-c", "manifest.sha256"], { cwd: directory, stdio: "pipe" });
  const profile = JSON.parse(execFileSync("cat", [join(directory, "deployment-profile.json")], { encoding: "utf8" }));
  expect(profile.target).toEqual({ runtime: "podman", manager: "ansible" });
  for (const required of [
    "ansible/playbook.yml",
    "ansible/requirements.yml",
    "ansible/roles/get_owncloud/tasks/main.yml",
    "scripts/runtime-common.sh"
  ]) expect(execFileSync("test", ["-f", join(directory, required)])).toBeDefined();
});

test("advanced identity, S3, Collabora, ClamAV and SMTP choices produce one sized bundle", async ({ page }) => {
  await page.goto("/");
  // Wait for catalogs to be loaded by checking for an element that's updated after loading
  await page.waitForSelector("#image-digest-note", { state: "visible" });
  await page.waitForTimeout(500);
  await page.locator("#registered-users").fill("100");
  await expect(page.locator("#identity-mode")).toHaveValue("external-oidc");
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

  await page.locator("#office-mode").selectOption("collabora");
  await page.locator('[name="collaboraConcurrentUsers"]').fill("10");
  await page.locator('[name="collaboraDomain"]').fill("office.corp.example");
  await page.locator('[name="collaboraAdminPassword"]').fill("local-test-collabora-password");
  await page.locator("#clamav").check();
  await page.locator("#notifications").check();
  await page.locator('[name="smtpHost"]').fill("smtp.corp.example");
  await page.locator('[name="smtpSender"]').fill("ownCloud <noreply@corp.example>");
  await page.locator('[name="smtpUsername"]').fill("owncloud");
  await page.locator('[name="smtpPassword"]').fill("local-test-smtp-password");
  await page.locator('[name="systemCpu"]').fill("16");
  await page.locator('[name="systemRamGiB"]').fill("32");
  await page.locator('[name="systemDiskGiB"]').fill("1000");

  await page.getByRole("button", { name: "Validate and calculate" }).click();
  await expect(page.locator("#validation-errors")).toBeHidden();
  for (const component of ["Search and extraction", "Bundled Collabora", "ClamAV", "Entered host comparison"]) {
    await expect(page.locator("#sizing-breakdown")).toContainText(component);
  }
  const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(accessibility.violations).toEqual([]);
  await page.locator("#eula").check();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#generate").click();
  const download = await downloadPromise;
  const directory = await mkdtemp(join(tmpdir(), "get-owncloud-advanced-"));
  const zip = join(directory, download.suggestedFilename());
  await download.saveAs(zip);
  execFileSync("unzip", ["-q", zip, "-d", directory]);
  execFileSync("sha256sum", ["-c", "manifest.sha256"], { cwd: directory, stdio: "pipe" });
  for (const required of ["s3ng.yml", "collabora.yml", "clamav.yml", "tika.yml", "external-oidc.yml"]) {
    execFileSync("test", ["-f", join(directory, required)]);
  }
  await page.locator("#office-deployment").selectOption("external");
  await page.locator('[name="collaboraUrl"]').fill("https://office.corp.example");
  await page.locator("#filesystem").selectOption("nfs");
  await page.getByRole("button", { name: "Validate and calculate" }).click();
  await expect(page.locator("#validation-errors")).toBeHidden();
  await expect(page.getByText("NFS selection is blocked unless", { exact: false })).toBeVisible();
});

test("production and policy boundaries fail closed", async ({ page }) => {
  await page.goto("/");
  // Wait for catalogs to be loaded by checking for an element that's updated after loading
  await page.waitForSelector("#image-digest-note", { state: "visible" });
  await page.waitForTimeout(500);
  await page.locator("#purpose").selectOption("production");
  await page.getByRole("button", { name: "Validate and calculate" }).click();
  await expect(page.locator("#validation-errors")).toContainText("Production requires a real FQDN");
  await expect(page.locator("#validation-errors")).toContainText("backup recipient");
  await expect(page.locator("#generate")).toBeDisabled();
  const storageOptions = await page.locator("#storage-mode option").allTextContents();
  expect(storageOptions).toEqual(["Standard ocis driver", "s3ng blobs with POSIX metadata"]);
  const officeOptions = await page.locator("#office-mode option").allTextContents();
  expect(officeOptions).toEqual(["None", "Collabora"]);
  await page.locator('[name="systemCpu"]').fill("4");
  await page.getByRole("button", { name: "Validate and calculate" }).click();
  await expect(page.locator("#validation-errors")).toContainText("all three optional host resource values");
});

test("keyboard users can reach the skip target and operate the runtime selector", async ({ page }) => {
  await page.goto("/");
  // Wait for catalogs to be loaded by checking for an element that's updated after loading
  await page.waitForSelector("#image-digest-note", { state: "visible" });
  await page.waitForTimeout(500);
  await page.keyboard.press("Tab");
  await expect(page.locator(".skip-link")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
  await page.locator("#runtime").focus();
  await page.keyboard.press("End");
  await expect(page.locator("#runtime")).toHaveValue("kubernetes");
  await expect(page.locator("#maturity-note")).toContainText("issue #6 remains open");
});
