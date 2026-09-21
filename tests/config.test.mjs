import { test } from "node:test";
import assert from "node:assert/strict";
import { publicConfig } from "../tools/config.mjs";

const defaults = {
  PERSISTENCE_MODE: "shared",
  SUPABASE_URL: "https://project.example.test",
  SUPABASE_ANON_KEY: "sb_publishable_test",
  REQUIRE_SHARED_CONFIG: "true",
  APP_BASE_PATH: "/",
};
const config = (overrides = {}) =>
  publicConfig({ production: true, overrides: { ...defaults, ...overrides } });

test("deployment configuration normalizes Pages paths and allowlists public values", async () => {
  for (const input of ["/group", "/group/", "/group//"]) {
    const result = await config({
      APP_BASE_PATH: input,
      PRIVATE_TOKEN: "not-for-browser",
    });
    assert.equal(result.basePath, "/group/");
    assert.equal(result.hashRouting, true);
    assert.equal(JSON.stringify(result).includes("not-for-browser"), false);
  }
  assert.equal((await config({ APP_BASE_PATH: "" })).basePath, "/");
  await assert.rejects(
    config({ APP_BASE_PATH: "/../private/" }),
    /APP_BASE_PATH/,
  );
});

test("deployment rejects missing configuration, local mode and privileged keys", async () => {
  await assert.rejects(config({ SUPABASE_URL: "" }), /requires a configured/);
  await assert.rejects(
    config({ PERSISTENCE_MODE: "local" }),
    /requires a configured/,
  );
  await assert.rejects(
    config({ SUPABASE_ANON_KEY: "sb_secret_test" }),
    /secret Supabase key/,
  );
  const jwt = (role) =>
    `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.test`;
  await assert.rejects(
    config({ SUPABASE_ANON_KEY: jwt("service_role") }),
    /Only the legacy anon/,
  );
  assert.equal(
    (await config({ SUPABASE_ANON_KEY: jwt("anon") })).mode,
    "shared",
  );
  await assert.rejects(config({ SUPABASE_URL: "javascript:bad" }), /HTTP\(S\)/);
});
