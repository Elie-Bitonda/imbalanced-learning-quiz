import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
export async function publicConfig({
  production = false,
  overrides = {},
} = {}) {
  let local = {};
  try {
    local = parseEnv(await readFile(".env", "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const env = { ...local, ...process.env, ...overrides };
  const mode = env.PERSISTENCE_MODE || "shared";
  if (!["shared", "local"].includes(mode))
    throw new Error("PERSISTENCE_MODE must be shared or local.");
  const supabaseUrl = env.SUPABASE_URL || "";
  const supabaseKey = env.SUPABASE_ANON_KEY || "";
  if (supabaseKey.startsWith("sb_secret_"))
    throw new Error(
      "A secret Supabase key must never be used in the frontend. Use the publishable key.",
    );
  if (supabaseKey.startsWith("eyJ")) {
    try {
      const claims = JSON.parse(
        Buffer.from(supabaseKey.split(".")[1], "base64url").toString(),
      );
      if (claims.role !== "anon") throw new Error("not anon");
    } catch {
      throw new Error(
        "Only the legacy anon JWT key is allowed in a frontend build.",
      );
    }
  }
  if (
    supabaseUrl &&
    (!URL.canParse(supabaseUrl) ||
      !["https:", "http:"].includes(new URL(supabaseUrl).protocol))
  )
    throw new Error("SUPABASE_URL must be an HTTP(S) URL.");
  if (
    env.REQUIRE_SHARED_CONFIG === "true" &&
    (mode !== "shared" ||
      !supabaseUrl ||
      !supabaseKey ||
      supabaseUrl.includes("YOUR_PROJECT") ||
      supabaseKey.includes("YOUR_"))
  )
    throw new Error(
      "Deployment requires a configured shared Supabase project.",
    );
  const basePath = (env.APP_BASE_PATH || "/").replace(/\/+$/, "") + "/";
  if (!/^\/(?:[a-zA-Z0-9_.-]+\/)*$/.test(basePath) || basePath.includes(".."))
    throw new Error("APP_BASE_PATH must look like /repository/ or /.");
  return { mode, supabaseUrl, supabaseKey, basePath, hashRouting: production };
}
