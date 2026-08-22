import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = process.cwd();
const excluded = new Set([".git", "dist", "node_modules"]);
const paths = [];

async function walk(directory) {
  for (const entry of await readdir(directory)) {
    if (excluded.has(entry)) continue;
    const path = join(directory, entry);
    const info = await stat(path);
    if (info.isDirectory()) await walk(path);
    else paths.push(path);
  }
}

await walk(root);
paths.sort();
const files = [];
for (const path of paths) {
  const bytes = await readFile(path);
  const name = relative(root, path);
  files.push({
    SPDXID: `SPDXRef-File-${createHash("sha256").update(name).digest("hex").slice(0, 16)}`,
    fileName: `./${name}`,
    checksums: [{ algorithm: "SHA256", checksumValue: createHash("sha256").update(bytes).digest("hex") }],
    licenseConcluded: "NOASSERTION",
    copyrightText: "NOASSERTION"
  });
}

const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const sbom = {
  spdxVersion: "SPDX-2.3",
  dataLicense: "CC0-1.0",
  SPDXID: "SPDXRef-DOCUMENT",
  name: `${packageJson.name}-${packageJson.version}`,
  documentNamespace: `https://get.owncloud.com/sbom/${packageJson.version}`,
  creationInfo: {
    created: new Date(0).toISOString(),
    creators: ["Tool: get-owncloud/scripts/generate-sbom.mjs"]
  },
  packages: [{
    SPDXID: "SPDXRef-Package-get-owncloud",
    name: packageJson.name,
    versionInfo: packageJson.version,
    downloadLocation: "https://github.com/amamus/get-owncloud",
    filesAnalyzed: true,
    licenseConcluded: "Apache-2.0",
    licenseDeclared: "Apache-2.0",
    copyrightText: "Copyright 2026 ownCloud GmbH, a Kiteworks company"
  }],
  files,
  relationships: files.map((file) => ({
    spdxElementId: "SPDXRef-Package-get-owncloud",
    relationshipType: "CONTAINS",
    relatedSpdxElement: file.SPDXID
  }))
};

await mkdir(join(root, "dist"), { recursive: true });
await writeFile(join(root, "dist/sbom.spdx.json"), `${JSON.stringify(sbom, null, 2)}\n`);
