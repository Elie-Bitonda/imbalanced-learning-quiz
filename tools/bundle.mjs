import { build } from "esbuild";
export async function bundle(config, minify = false) {
  const result = await build({
    entryPoints: ["src/app.js"],
    bundle: true,
    write: false,
    format: "esm",
    target: "es2022",
    minify,
    define: { __APP_CONFIG__: JSON.stringify(config) },
    logLevel: "silent",
  });
  return result.outputFiles[0].contents;
}
