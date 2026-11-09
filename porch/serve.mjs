import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";

const root = process.argv[2];
const port = Number(process.argv[3] || 4173);

if (!root || !existsSync(root)) {
  console.error(root ? `${root}: no such dir` : "usage: node porch/serve.mjs <dir> [port]");
  process.exit(1);
}

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const rel = decodeURIComponent(url.pathname);
  const file = join(root, rel === "/" ? "index.html" : rel.slice(1));
  if (!existsSync(file)) {
    res.statusCode = 404;
    res.end();
    return;
  }
  res.setHeader("content-type", types[extname(file)] ?? "application/octet-stream");
  res.end(readFileSync(file));
});

server.on("error", (err) => {
  console.error(err.message);
  process.exit(1);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`http://127.0.0.1:${port}`);
});
