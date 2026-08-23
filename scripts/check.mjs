import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const failures = [];
const fail = (message) => failures.push(message);
const text = async (path) => readFile(new URL(path, root), "utf8");
const json = async (path) => JSON.parse(await text(path));

const catalogFiles = (await readdir(new URL("catalog/", root))).filter((name) => name.endsWith(".json"));
for (const name of catalogFiles) {
  try { await json(`catalog/${name}`); } catch (error) { fail(`Invalid catalog/${name}: ${error.message}`); }
}
for (const name of ["deployment.schema.json", "sizing-input.schema.json", "update-policy.schema.json"]) {
  try { await json(`schema/${name}`); } catch (error) { fail(`Invalid schema/${name}: ${error.message}`); }
}

const install = await text("scripts/install.sh");
const installLines = install.trimEnd().split("\n").length;
if (installLines > 500) fail(`install.sh has ${installLines} lines; maximum is 500`);
for (const flag of ["--non-interactive", "--install-missing", "--allow-sudo", "--accept-eula"]) {
  if (!install.includes(flag)) fail(`install.sh is missing ${flag}`);
}
if (!install.includes("/dev/tty")) fail("install.sh must explicitly support /dev/tty approval");

const releaseWorkflow = await text(".github/workflows/release.yml");
for (const required of ["generate-sbom.mjs", "attest-build-provenance@", "subject-path: \"dist/*\"", "uses: ./.github/workflows/deployment-e2e.yml", "tags:"]) {
  if (!releaseWorkflow.includes(required)) fail(`Release workflow is missing: ${required}`);
}

const html = await text("index.html");
for (const required of [
  "<h1 id=\"page-title\">Deploy ownCloud by Kiteworks</h1>",
  "No warranties",
  "Limitation of liability",
  "noindex,nofollow",
  "aria-live=\"polite\"",
  '"@type": "HowTo"',
  '"@type": "FAQPage"',
  "site/assets/owncloud-logo.svg"
]) if (!html.includes(required)) fail(`index.html is missing: ${required}`);
if (/ONLYOFFICE/i.test(html)) fail("The public site must not expose ONLYOFFICE");
const jsonLd = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
if (!jsonLd) fail("index.html is missing structured JSON-LD");
else {
  const cspHash = createHash("sha256").update(jsonLd).digest("base64");
  if (!html.includes(`'sha256-${cspHash}'`)) fail("Content Security Policy does not authorize the exact JSON-LD block");
}

const robots = await text("robots.txt");
if (!robots.includes("Disallow: /")) fail("Development robots.txt must block indexing");
for (const crawler of ["OAI-SearchBot", "GPTBot"]) {
  if (!robots.includes(`User-agent: ${crawler}`)) fail(`Development robots.txt must state the ${crawler} policy explicitly`);
}
const sitemap = await text("sitemap.xml");
if (sitemap.includes("<url>")) fail("Development sitemap must remain empty");

const llms = await text("llms.txt");
for (const section of ["Deployment constraints", "EULA", "Support and maturity", "Documentation"]) {
  if (!llms.includes(`## ${section}`)) fail(`llms.txt is missing ${section}`);
}

const sizing = await json("catalog/sizing.json");
const breakdown = Object.values(sizing.headroomBreakdown).reduce((sum, value) => sum + value, 0);
if (breakdown !== sizing.defaults.headroomPercent) fail("Sizing headroom breakdown must equal the default");
if (!sizing.productionLoadTestRequired) fail("Production load testing must be mandatory");

const compatibility = await json("catalog/compatibility.json");
if (compatibility.helm.targetOcisVersion !== "7.1.4" || compatibility.helm.declaredAppVersion !== "7.1.4") {
  fail("Helm target and declared app version must remain at 7.1.4 while issue #6 is open");
}
if (compatibility.helm.runnable !== true || compatibility.helm.production !== false || compatibility.helm.openIssue !== 6) {
  fail("Helm must be runnable Community Preview, non-production, with issue #6 open");
}

const policies = await json("catalog/policies.json");
if (policies.identity.embeddedMaximumUsers !== 20) fail("Embedded identity limit must be 20");
if (policies.storage.requiredNfsVersion !== "4.2") fail("NFS policy must require v4.2");
if (!policies.denyExperimental) fail("Experimental features must be denied");

const featureCatalogue = await json("catalog/features.json");
for (const feature of featureCatalogue.features) {
  for (const field of ["id", "label", "maturity", "targets", "dependencies", "resourceImpact", "documentation"]) {
    if (feature[field] === undefined) fail(`Feature catalogue entry ${feature.id ?? "<unknown>"} is missing ${field}`);
  }
}

const logo = await readFile(new URL("site/assets/owncloud-logo.svg", root));
const sources = await json("catalog/sources.lock.json");
const logoHash = createHash("sha256").update(logo).digest("hex");
if (logoHash !== sources.sources.brandLogo.vendoredSha256) fail("Vendored ownCloud logo hash does not match the source lock");

const composeTemplates = await readdir(new URL("deploy/compose/template/", root));
for (const name of composeTemplates) {
  if (/onlyoffice|posixfs|xattr|gpfs/i.test(name)) fail(`Forbidden deployment template is present: ${name}`);
}

for (const workflowName of ["ci.yml", "browser-e2e.yml", "deployment-e2e.yml", "pages.yml", "release.yml", "upstream-discovery.yml"]) {
  const workflow = await text(`.github/workflows/${workflowName}`);
  for (const match of workflow.matchAll(/uses:\s+([^\s]+)/g)) {
    if (!match[1].startsWith("./") && !/@[0-9a-f]{40}$/.test(match[1])) fail(`${workflowName} has an unpinned action: ${match[1]}`);
  }
}
const deploymentWorkflow = await text(".github/workflows/deployment-e2e.yml");
for (const evidence of ["runtime-e2e.sh", "Collabora lifecycle", "validate-helm.mjs", "Ansible double-apply"]) {
  if (!deploymentWorkflow.includes(evidence)) fail(`Full deployment E2E is missing: ${evidence}`);
}
if (!deploymentWorkflow.includes("workflow_call:")) fail("Full deployment E2E must be callable by the release workflow");
const upstreamWorkflow = await text(".github/workflows/upstream-discovery.yml");
for (const evidence of ["schedule:", "upstream-discovery.mjs", "issues: write", "No pin or deployment was changed"]) {
  if (!upstreamWorkflow.includes(evidence)) fail(`Upstream discovery workflow is missing: ${evidence}`);
}
const runtimeE2e = await text("scripts/runtime-e2e.sh");
for (const evidence of ["backup.sh", "restore.sh", "WebDAV", "hosting/discovery", "get_owncloud_compose restart"]) {
  if (!runtimeE2e.includes(evidence)) fail(`Runtime E2E is missing: ${evidence}`);
}
for (const evidence of ["podman-rootless-runtime", "part1-platform-contract", "ubuntu-22.04", "ubuntu-24.04"]) {
  if (!deploymentWorkflow.includes(evidence)) fail(`Deployment workflow is missing matrix evidence: ${evidence}`);
}

const updateFeed = await text("releases/stable-8.2.env");
const updateChecksum = (await text("releases/stable-8.2.env.sha256")).trim().split(/\s+/)[0];
if (createHash("sha256").update(updateFeed).digest("hex") !== updateChecksum) fail("Stable 8.2 update feed checksum is stale");

const codeowners = await text(".github/CODEOWNERS");
if (/@(?:docker|k8s|ansible|web|docs)-maintainer/.test(codeowners)) fail("CODEOWNERS must not use invented accounts");

if (failures.length) {
  console.error(failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}
console.log(`Checks passed: ${catalogFiles.length} catalogues, ${installLines}-line bootstrap, policy and site contracts.`);
