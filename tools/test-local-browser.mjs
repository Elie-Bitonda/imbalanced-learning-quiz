import { spawn } from "node:child_process";
const port = process.env.TEST_PORT || "4181";
const server = spawn(process.execPath, ["tools/server.mjs"], {
  env: {
    ...process.env,
    PORT: port,
    PERSISTENCE_MODE: "local",
    SUPABASE_URL: "",
    SUPABASE_ANON_KEY: "",
  },
  windowsHide: true,
  stdio: ["ignore", "pipe", "inherit"],
});
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Test server startup timed out")),
      30000,
    );
    server.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Test server exited ${code}`));
    });
    server.stdout.on("data", (chunk) => {
      if (chunk.toString().includes("Forma is ready")) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  for (const script of [
    "tests/browser.mjs",
    "tests/difficulty-browser.mjs",
    "tests/mixed-browser.mjs",
  ]) {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [script], {
        env: { ...process.env, BASE_URL: `http://127.0.0.1:${port}` },
        windowsHide: true,
        stdio: "inherit",
      });
      child.once("exit", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`${script} failed (${code})`)),
      );
    });
  }
} finally {
  server.kill();
}
