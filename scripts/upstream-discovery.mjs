import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function normalizeVersion(value) {
  return String(value).replace(/^v/, "").split("-")[0];
}

export function latestSameMinor(releases, minor) {
  const prefix = `${minor}.`;
  return releases
    .filter((release) => !release.draft && !release.prerelease && normalizeVersion(release.tag_name).startsWith(prefix))
    .map((release) => normalizeVersion(release.tag_name))
    .sort((a, b) => {
      const left = a.split(".").map(Number);
      const right = b.split(".").map(Number);
      for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
        if ((left[index] ?? 0) !== (right[index] ?? 0)) return (right[index] ?? 0) - (left[index] ?? 0);
      }
      return 0;
    })[0] ?? null;
}

export function classifyObservation(check, observed, error = null) {
  if (error) return { ...check, observed: null, status: "error", error: String(error) };
  return { ...check, observed, status: observed === check.expected ? "current" : "review-required" };
}

async function fetchChecked(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} from ${url}`);
  return response;
}

async function observe(check, token) {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "get-owncloud-upstream-discovery" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const api = `https://api.github.com/repos/${check.repository}`;
  if (check.kind === "github-commit") {
    const response = await fetchChecked(`${api}/commits/${encodeURIComponent(check.ref)}`, { headers });
    return (await response.json()).sha;
  }
  if (check.kind === "github-latest-commit") {
    const response = await fetchChecked(`${api}/commits?per_page=1`, { headers });
    return (await response.json())[0]?.sha ?? null;
  }
  if (check.kind === "github-same-minor-release") {
    const response = await fetchChecked(`${api}/releases?per_page=100`, { headers });
    return latestSameMinor(await response.json(), check.minor);
  }
  if (check.kind === "https-sha256") {
    const response = await fetchChecked(check.url);
    return createHash("sha256").update(Buffer.from(await response.arrayBuffer())).digest("hex");
  }
  throw new Error(`Unknown upstream check kind: ${check.kind}`);
}

export async function runDiscovery(catalog, token = "") {
  const checks = [];
  for (const check of catalog.checks) {
    try { checks.push(classifyObservation(check, await observe(check, token))); }
    catch (error) { checks.push(classifyObservation(check, null, error.message)); }
  }
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    summary: {
      current: checks.filter((item) => item.status === "current").length,
      reviewRequired: checks.filter((item) => item.status === "review-required").length,
      errors: checks.filter((item) => item.status === "error").length
    },
    checks
  };
}

async function main() {
  const catalogPath = process.argv[2] ?? "catalog/upstream-watch.json";
  const outputPath = process.argv[3] ?? "upstream-report.json";
  const catalog = JSON.parse(await readFile(resolve(catalogPath), "utf8"));
  const report = await runDiscovery(catalog, process.env.GITHUB_TOKEN ?? "");
  await writeFile(resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Upstream discovery: ${report.summary.current} current, ${report.summary.reviewRequired} review-required, ${report.summary.errors} errors`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await main();
