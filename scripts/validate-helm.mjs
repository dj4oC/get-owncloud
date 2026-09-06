import Ajv from "ajv";
import YAML from "yaml";
import { readFile } from "node:fs/promises";
import { deepClone } from "../src/clone.mjs";
import { calculateSizing, loadCatalog, validateProfile } from "../src/core.mjs";
import { buildKubernetesBundle, buildHelmValues } from "../src/kubernetes.mjs";

const chartDirectory = process.argv[2];
if (!chartDirectory) throw new Error("Usage: node scripts/validate-helm.mjs PATH_TO_PINNED_OCIS_CHART");
const rawProfile = JSON.parse(await readFile(new URL("../examples/kubernetes-7.1.4-preview.json", import.meta.url), "utf8"));
const checked = await validateProfile(rawProfile);
if (!checked.valid) throw new Error(checked.errors.join("\n"));
const sizing = await calculateSizing(checked.profile);
const valuesText = buildHelmValues(checked.profile, sizing);
const values = YAML.parse(valuesText);
const schema = JSON.parse(await readFile(`${chartDirectory}/values.schema.json`, "utf8"));
const defaults = YAML.parse(await readFile(`${chartDirectory}/values.yaml`, "utf8"));
function merge(target, overrides) {
  for (const [key, item] of Object.entries(overrides)) {
    if (item && typeof item === "object" && !Array.isArray(item) && target[key] && typeof target[key] === "object" && !Array.isArray(target[key])) {
      merge(target[key], item);
    } else target[key] = deepClone(item);
  }
  return target;
}
const coalescedValues = merge(deepClone(defaults), values);
const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });
const validate = ajv.compile(schema);
if (!validate(coalescedValues)) throw new Error(ajv.errorsText(validate.errors, { separator: "\n" }));

const templates = {
  "scripts/install.sh": await readFile(new URL("install.sh", import.meta.url), "utf8"),
  "scripts/deploy-kubernetes.sh": await readFile(new URL("deploy-kubernetes.sh", import.meta.url), "utf8")
};
const files = await buildKubernetesBundle({
  profile: checked.profile,
  sizing,
  templates,
  legal: await loadCatalog("legal"),
  sources: await loadCatalog("sources.lock"),
  acceptance: { acceptedAt: new Date(0).toISOString(), acceptedBy: "ci" }
});
const application = YAML.parse(files["argocd/application.yaml"]);
const argoValues = YAML.parse(application.spec.source.helm.values);
if (JSON.stringify(values) !== JSON.stringify(argoValues)) throw new Error("Direct Helm and Argo CD values are not equivalent");
if (application.spec.source.targetRevision !== "0.7.0") throw new Error("Argo CD chart boundary changed");
if (values.image.tag !== "7.1.4") throw new Error("oCIS #6 version boundary changed");
console.log("Helm values schema and direct/Argo equivalence passed at chart 0.7.0 / oCIS 7.1.4.");
