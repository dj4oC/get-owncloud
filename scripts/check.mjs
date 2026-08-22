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
for (const name of ["deployment.schema.json", "sizing-input.schema.json"]) {
  try { await json(`schema/${name}`); } catch (error) { fail(`Invalid schema/${name}: ${error.message}`); }
}

const install = await text("scripts/install.sh");
const installLines = install.trimEnd().split("\n").length;
if (installLines > 500) fail(`install.sh has ${installLines} lines; maximum is 500`);
for (const flag of ["--non-interactive", "--install-missing", "--allow-sudo", "--accept-eula"]) {
  if (!install.includes(flag)) fail(`install.sh is missing ${flag}`);
}
if (!install.includes("/dev/tty")) fail("install.sh must explicitly support /dev/tty approval");

const html = await text("index.html");
for (const required of [
  "<h1 id=\"page-title\">Deploy ownCloud by Kiteworks</h1>",
  "No warranties",
  "Limitation of liability",
  "noindex,nofollow",
  "aria-live=\"polite\""
]) if (!html.includes(required)) fail(`index.html is missing: ${required}`);
if (/ONLYOFFICE/i.test(html)) fail("The public site must not expose ONLYOFFICE");

const robots = await text("robots.txt");
if (!robots.includes("Disallow: /")) fail("Development robots.txt must block indexing");
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
if (compatibility.helm.targetOcisVersion === compatibility.helm.declaredAppVersion) {
  fail("Compatibility fixture should expose the current Helm/oCIS mismatch");
}
if (compatibility.helm.runnable !== false) fail("Incompatible Helm output must be blocked");

const policies = await json("catalog/policies.json");
if (policies.identity.embeddedMaximumUsers !== 20) fail("Embedded identity limit must be 20");
if (policies.storage.requiredNfsVersion !== "4.2") fail("NFS policy must require v4.2");
if (!policies.denyExperimental) fail("Experimental features must be denied");

const codeowners = await text(".github/CODEOWNERS");
if (/@(?:docker|k8s|ansible|web|docs)-maintainer/.test(codeowners)) fail("CODEOWNERS must not use invented accounts");

if (failures.length) {
  console.error(failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}
console.log(`Checks passed: ${catalogFiles.length} catalogues, ${installLines}-line bootstrap, policy and site contracts.`);
