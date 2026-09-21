import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { publicConfig } from "./config.mjs";
import { bundle } from "./bundle.mjs";
const config = await publicConfig({
  overrides: process.argv.includes("--local")
    ? { PERSISTENCE_MODE: "local" }
    : {},
});
const built = process.argv.includes("--dist");
const appBundle = !built ? await bundle(config) : null;
const root = resolve(process.argv.includes("--dist") ? "dist" : ".");
const port = Number(process.env.PORT || 4173);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};
createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    );
    const file = [
      "/",
      "/multiple-choice",
      "/multiple-choice/",
      "/multiple-choice/manage",
      "/multiple-choice/manage/",
    ].includes(path)
      ? "/index.html"
      : path;
    // Serve only application assets, never workspace documents or dependency files.
    if (
      !["/index.html", "/favicon.svg"].includes(file) &&
      !/^\/src\/[a-z0-9/.-]+\.(js|css)$/.test(file)
    ) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    const target = resolve(root, `.${file}`);
    if (!target.startsWith(root + "/") && !target.startsWith(root + "\\")) {
      response.writeHead(403);
      response.end();
      return;
    }
    const content =
      file === "/src/app.js" && appBundle ? appBundle : await readFile(target);
    response.writeHead(200, {
      "Content-Type": mime[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(content);
  } catch {
    if (!response.headersSent) response.writeHead(404);
    response.end("Not found");
  }
}).listen(port, "127.0.0.1", () =>
  console.log(`Forma is ready at http://127.0.0.1:${port}/multiple-choice`),
);
