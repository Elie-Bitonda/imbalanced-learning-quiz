import { cp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { bundle } from "./bundle.mjs";
import { publicConfig } from "./config.mjs";
const config = await publicConfig({ production: true });
const output = resolve("dist");
if (dirname(output) !== process.cwd())
  throw new Error("Build output must stay inside the project.");
await rm(output, { recursive: true, force: true });
await mkdir("dist/src", { recursive: true });
await writeFile("dist/src/app.js", await bundle(config, true));
await cp("src/styles.css", "dist/src/styles.css");
await cp("favicon.svg", "dist/favicon.svg");
const html = (await readFile("index.html", "utf8"))
  .replaceAll('href="/', `href="${config.basePath}`)
  .replaceAll('src="/', `src="${config.basePath}`);
await writeFile("dist/index.html", html);
await writeFile("dist/.nojekyll", "");
console.log(
  `Built GitHub Pages frontend in dist/ at ${config.basePath} (${config.mode}).`,
);
if (config.mode === "shared" && (!config.supabaseUrl || !config.supabaseKey))
  console.log(
    "Supabase is unconfigured: this build displays setup instructions and preserves local backups.",
  );
