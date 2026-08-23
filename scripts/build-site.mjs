import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const output = join(root, "_site");
const mode = process.env.SITE_MODE ?? "development";
if (!["development", "production"].includes(mode)) throw new Error("SITE_MODE must be development or production");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const directory of ["site", "src", "catalog", "schema", "docs", "deploy/compose/template", "scripts", "releases", "ansible"]) {
  await cp(join(root, directory), join(output, directory), { recursive: true });
}
for (const file of ["llms.txt", "SECURITY.md", "LICENSE", "README.md", "THIRD_PARTY_NOTICES.md"]) {
  await cp(join(root, file), join(output, file));
}
await cp(join(root, "scripts/install.sh"), join(output, "install.sh"));

let html = await readFile(join(root, "index.html"), "utf8");
let robots = "User-agent: *\nDisallow: /\n\nUser-agent: OAI-SearchBot\nDisallow: /\n\nUser-agent: GPTBot\nDisallow: /\n";
let sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n';
if (mode === "production") {
  html = html
    .replace('content="noindex,nofollow"', 'content="index,follow,max-image-preview:large,max-snippet:-1"')
    .replace('<p class="preview" data-preview-banner>Development preview · not indexed</p>', '<p class="preview" data-preview-banner>Production deployment configurator</p>');
  robots = "User-agent: *\nAllow: /\n\nUser-agent: OAI-SearchBot\nAllow: /\n\nUser-agent: GPTBot\nAllow: /\n\nSitemap: https://get.owncloud.com/sitemap.xml\n";
  sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://get.owncloud.com/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>\n</urlset>\n';
}
await writeFile(join(output, "index.html"), html);
await writeFile(join(output, "robots.txt"), robots);
await writeFile(join(output, "sitemap.xml"), sitemap);
await writeFile(join(output, "build-mode.txt"), `${mode}\n`);
console.log(`Built ${mode} static site in _site`);
