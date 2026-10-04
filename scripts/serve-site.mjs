import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";

const root = resolve(process.argv[2] ?? "_site");
const port = Number(process.argv[3] ?? 4173);
const contentTypes = {
  ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".md": "text/markdown; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml; charset=utf-8", ".yaml": "application/yaml; charset=utf-8", ".yml": "application/yaml; charset=utf-8"
};

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    let path = resolve(join(root, pathname.replace(/^\/+/, "")));
    if (path !== root && !path.startsWith(root + sep)) throw new Error("unsafe path");
    if ((await stat(path)).isDirectory()) path = join(path, "index.html");
    const data = await readFile(path);
    response.writeHead(200, {
      "Content-Type": contentTypes[extname(path)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Content-Security-Policy": "default-src 'self'; script-src 'self' 'sha256-IQZAzsaFYMMie9R369mqIVVyx9QQURrNhDcAQi0HMPI=' 'sha256-wwzBcyW3AW1LMI40nCslCBRkRSEYESlUFCk9rO4/7hE=' 'sha256-GR+Z1LyL6nS8ipAJioFLPJIjMriR83CIJXs9l9NnvIo=' 'sha256-Iy10dZGLAtUtXbxJVazu/NNlKD1/tHvDQyQtRiF/6BU=' 'sha256-V5cvZw+reBTOn+gsqWIj5MdcXGwJqrSf9m2YgLv+eSw=' 'sha256-l+zKKYFA0cr3mIqmc9gWDjz8XYRzYtDFry60aAoW+No='; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'",
    });
    response.end(data);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found\n");
  }
}).listen(port, "127.0.0.1", () => console.log(`Serving ${root} at http://127.0.0.1:${port}`));
