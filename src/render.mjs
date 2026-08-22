import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { dirname, join } from "node:path";
import { buildSingleHostBundle, requiredTemplatePaths } from "./bundle.mjs";
import { buildKubernetesBundle, requiredKubernetesTemplatePaths } from "./kubernetes.mjs";
import { calculateSizing, loadCatalog, validateProfile } from "./core.mjs";

const ROOT = new URL("../", import.meta.url);

async function readTemplates(profile) {
  const templates = {};
  const paths = profile.target.runtime === "kubernetes"
    ? requiredKubernetesTemplatePaths()
    : requiredTemplatePaths(profile);
  for (const path of paths) {
    templates[path] = await readFile(new URL(path, ROOT), "utf8");
  }
  return templates;
}

export async function renderProfile({ rawProfile, outputDirectory, secrets, acceptance }) {
  const checked = await validateProfile(rawProfile);
  if (!checked.valid) throw new Error(checked.errors.join("\n"));
  const sizing = await calculateSizing(checked.profile);
  const templates = await readTemplates(checked.profile);
  const inputs = {
    profile: checked.profile, sizing, templates, secrets,
    legal: await loadCatalog("legal"), sources: await loadCatalog("sources.lock"), acceptance
  };
  const files = checked.profile.target.runtime === "kubernetes"
    ? await buildKubernetesBundle(inputs)
    : await buildSingleHostBundle(inputs);
  for (const [path, content] of Object.entries(files)) {
    const destination = join(outputDirectory, path);
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    await writeFile(destination, content, { mode: path === ".env" ? 0o600 : 0o644 });
    if (path === "install.sh" || path === "deploy.sh" || path.startsWith("scripts/")) await chmod(destination, 0o755);
  }
  return { profile: checked.profile, sizing, files };
}
