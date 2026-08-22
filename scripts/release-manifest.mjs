import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = process.cwd();
const excluded = new Set([".git", "dist", "node_modules"]);
const files = [];

async function walk(directory) {
  for (const entry of await readdir(directory)) {
    if (excluded.has(entry)) continue;
    const path = join(directory, entry);
    const info = await stat(path);
    if (info.isDirectory()) await walk(path);
    else files.push(path);
  }
}

await walk(root);
files.sort();
const manifest = [];
for (const path of files) {
  const bytes = await readFile(path);
  manifest.push({ path: relative(root, path), sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length });
}
await mkdir(join(root, "dist"), { recursive: true });
await writeFile(join(root, "dist/source-manifest.json"), `${JSON.stringify({ version: 1, files: manifest }, null, 2)}\n`);
await writeFile(join(root, "dist/checksums.txt"), manifest.map((item) => `${item.sha256}  ${item.path}`).join("\n") + "\n");
