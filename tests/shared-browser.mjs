import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { bundle } from "../tools/bundle.mjs";
import { defaultQuestions } from "../src/data/questions.js";

// Hosted frontend and mocked Supabase network are independent of normal browser storage.
const config = {
  mode: "shared",
  supabaseUrl: "https://shared.example.test",
  supabaseKey: "sb_publishable_test_only",
  basePath: "/group/",
  hashRouting: true,
};
const compiled = await bundle(config, true);
const html = (await readFile("index.html", "utf8"))
  .replaceAll('href="/', 'href="/group/')
  .replaceAll('src="/', 'src="/group/');
const css = await readFile("src/styles.css");
const server = createServer(async (req, res) => {
  if (req.url === "/group/" || req.url === "/group/index.html") {
    res.setHeader("content-type", "text/html");
    res.end(html);
  } else if (req.url === "/group/src/app.js") {
    res.setHeader("content-type", "text/javascript");
    res.end(compiled);
  } else if (req.url === "/group/src/styles.css") {
    res.setHeader("content-type", "text/css");
    res.end(css);
  } else if (req.url === "/group/favicon.svg") {
    res.setHeader("content-type", "image/svg+xml");
    res.end(await readFile("favicon.svg"));
  } else {
    res.statusCode = 404;
    res.end("Not found");
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/group/`;
const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL || "chrome",
});
let revision = 1;
let questions = defaultQuestions().map((q) => ({
  ...q,
  revision: "1",
  createdBy: null,
}));
let editorAllowed = true;
let readCount = 0;
let failReads = false;
const user = {
  id: "11111111-1111-4111-8111-111111111111",
  aud: "authenticated",
  role: "authenticated",
  email: "editor@example.test",
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: new Date().toISOString(),
};
const token = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test`;
const snapshot = () => ({ revision: String(revision), questions });
const errors = [];
async function context() {
  const ctx = await browser.newContext();
  await ctx.route("https://shared.example.test/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const respond = (data, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    if (url.pathname.endsWith("/token"))
      return respond({
        access_token: token,
        refresh_token: "test-refresh",
        expires_in: 3600,
        token_type: "bearer",
        user,
      });
    if (url.pathname.endsWith("/logout")) return respond({});
    if (url.pathname.endsWith("/user")) return respond(user);
    const isEditor =
      request.headers().authorization === `Bearer ${token}` && editorAllowed;
    if (url.pathname.endsWith("/is_question_editor")) return respond(isEditor);
    if (url.pathname.endsWith("/read_question_bank")) {
      readCount++;
      return failReads
        ? respond({ message: "Network unavailable" }, 503)
        : respond(snapshot());
    }
    if (url.pathname.endsWith("/mutate_questions")) {
      if (!isEditor)
        return respond(
          { message: "An authorized editor account is required." },
          403,
        );
      const { action, payload, expected } = request.postDataJSON();
      if (action === "create")
        questions.push({
          ...payload,
          revision: "1",
          createdBy: user.id,
          order: questions.length,
        });
      else if (action === "update") {
        const index = questions.findIndex((q) => q.id === payload.id);
        if (index < 0 || questions[index].revision !== expected)
          return respond(
            {
              message:
                "This question was changed by another editor. Keep your draft and reopen the latest question.",
            },
            409,
          );
        questions[index] = {
          ...questions[index],
          ...payload,
          revision: String(Number(expected) + 1),
          updatedAt: new Date().toISOString(),
        };
      } else if (action === "delete")
        questions = questions.filter((q) => q.id !== payload.id);
      else if (action === "migrate") {
        for (const q of payload)
          if (!questions.some((existing) => existing.id === q.id))
            questions.push({
              ...q,
              revision: "1",
              createdBy: user.id,
              order: questions.length,
            });
      } else if (action === "append" || action === "replace") {
        if (action === "replace") questions = [];
        questions.push(
          ...payload.map((q) => ({
            ...q,
            revision: "1",
            createdBy: user.id,
            order: questions.length,
          })),
        );
      } else return respond({ message: "Unsupported test operation" }, 400);
      revision++;
      return respond(snapshot());
    }
    return respond({ message: "Unexpected endpoint" }, 404);
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  return { ctx, page };
}
const button = (page, name) => page.getByRole("button", { name, exact: true });
try {
  const a = await context(),
    b = await context();
  await b.page.clock.install();
  await a.page.goto(`${base}#/multiple-choice`);
  await b.page.goto(`${base}#/multiple-choice`);
  await a.page.locator(".answer").first().waitFor();
  await b.page.locator(".answer").first().waitFor();
  assert.equal(
    await a.page
      .getByRole("link", { name: "Question Manager", exact: true })
      .count(),
    0,
  );
  await a.page.goto(`${base}#/multiple-choice/manage`);
  await a.page
    .getByRole("heading", { name: "Editor access required" })
    .waitFor();
  assert.equal(await button(a.page, "Add Question").count(), 0);
  console.log(
    "PASS anonymous learner can study, but cannot see or access editing controls",
  );

  await button(a.page, "Editor sign in").first().click();
  await a.page.getByLabel("Email", { exact: true }).fill(user.email);
  await a.page
    .getByLabel("Password", { exact: true })
    .fill("test-password-only");
  await button(a.page, "Sign in").click();
  await button(a.page, "Add Question").waitFor();
  await a.page.reload();
  await button(a.page, "Add Question").waitFor();
  await a.page
    .locator(".manager-levels")
    .getByRole("link", { name: /^Pro / })
    .click();
  await a.page.locator("#add-question").click();
  assert.equal(await a.page.getByLabel("Difficulty Level").inputValue(), "pro");
  await a.page
    .getByLabel("Question", { exact: true })
    .fill("Collaborative Pro question");
  for (let i = 1; i <= 4; i++)
    await a.page
      .getByRole("textbox", { name: `Answer ${i}`, exact: true })
      .fill(`Option ${i}`);
  await a.page
    .getByRole("radio", { name: "Mark answer 1 correct", exact: true })
    .check();
  await a.page
    .getByLabel("Correct answer explanation")
    .fill("Option 1 is correct.");
  await button(a.page, "Save question").click();
  await a.page
    .getByRole("heading", { name: "Collaborative Pro question" })
    .waitFor();
  assert.equal(questions.length, 2);
  assert.equal(questions[1].createdBy, user.id);
  console.log(
    "PASS authorized editor signs in, persists a session, and creates a shared level question",
  );

  const before = readCount;
  await b.page.clock.fastForward(16000);
  await b.page.waitForFunction(
    () =>
      document.querySelector(".level-option.active .level-count")
        ?.textContent === "2",
  );
  assert.ok(readCount > before);
  await b.page
    .locator(".level-options")
    .getByRole("link", { name: /^Pro / })
    .click();
  await b.page
    .getByRole("heading", { name: "Collaborative Pro question" })
    .waitFor();
  assert.equal(await button(b.page, "Add Pro Question").count(), 0);
  assert.equal(
    await b.page.evaluate(() =>
      localStorage.getItem("forma.multiple-choice.questions.v1"),
    ),
    null,
  );
  await b.page.reload();
  await b.page
    .getByRole("heading", { name: "Collaborative Pro question" })
    .waitFor();
  console.log(
    "PASS another open device receives updates by polling; Pro/Mixed counts and refresh use the shared bank",
  );

  await a.page
    .locator(".question-row")
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await a.page.getByLabel("Question", { exact: true }).fill("My unsaved draft");
  questions[1] = { ...questions[1], revision: "2", question: "Teammate edit" };
  revision++;
  await button(a.page, "Save question").click();
  await a.page
    .getByText("This question was changed by another editor.", { exact: false })
    .waitFor();
  assert.equal(
    await a.page.getByLabel("Question", { exact: true }).inputValue(),
    "My unsaved draft",
  );
  assert.equal(questions[1].question, "Teammate edit");
  await button(a.page, "Cancel").click();
  await button(a.page, "Discard changes").click();
  await a.page.reload();
  await a.page.getByRole("heading", { name: "Teammate edit" }).waitFor();
  console.log(
    "PASS conflicting save preserves the draft and does not overwrite a teammate",
  );

  await button(a.page, "Migrate existing questions").click();
  const legacy = {
    ...defaultQuestions()[0],
    question: "Legacy migration example",
  };
  delete legacy.difficulty;
  await a.page.locator("#migration-file").setInputFiles({
    name: "local.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify([legacy])),
  });
  await button(a.page, "Migrate questions").click();
  await a.page.locator("dialog").waitFor({ state: "detached" });
  assert.equal(questions.find((q) => q.id === legacy.id).difficulty, "general");
  await button(a.page, "Migrate existing questions").click();
  await a.page.locator("#migration-file").setInputFiles({
    name: "local.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify([legacy])),
  });
  await button(a.page, "Migrate questions").click();
  await a.page.locator("dialog").waitFor({ state: "detached" });
  assert.equal(questions.filter((q) => q.id === legacy.id).length, 1);
  console.log(
    "PASS safe legacy migration preserves IDs and does not duplicate repeated uploads",
  );

  const downloadPromise = a.page.waitForEvent("download");
  await button(a.page, "Export").click();
  const stream = await (await downloadPromise).createReadStream(),
    chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  assert.equal(JSON.parse(Buffer.concat(chunks)).questions.length, 3);
  await button(a.page, "Sign out").click();
  await button(a.page, "Editor sign in").first().waitFor();
  assert.equal(
    await a.page
      .getByRole("link", { name: "Question Manager", exact: true })
      .count(),
    0,
  );
  editorAllowed = false;
  await button(a.page, "Editor sign in").first().click();
  await a.page.getByLabel("Email", { exact: true }).fill(user.email);
  await a.page
    .getByLabel("Password", { exact: true })
    .fill("test-password-only");
  await button(a.page, "Sign in").click();
  await a.page
    .getByText("You are signed in as a learner.", { exact: false })
    .waitFor();
  assert.equal(await button(a.page, "Add Question").count(), 0);
  console.log(
    "PASS shared export works and authenticated noneditors cannot manage questions",
  );

  for (const width of [1440, 768, 390, 320]) {
    await b.page.setViewportSize({ width, height: 900 });
    assert.ok(
      await b.page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Overflow ${width}`,
    );
  }
  failReads = true;
  await b.page.reload();
  await b.page
    .getByRole("heading", { name: "Couldn’t load the shared question bank" })
    .waitFor();
  assert.equal(await b.page.locator(".question-card").count(), 0);
  failReads = false;
  await button(b.page, "Try again").click();
  await b.page.locator(".answer").first().waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS GitHub Pages subpath/hash refresh, responsive layout, loading failures and retry",
  );
  console.log(
    "\n7 shared browser scenarios passed with mocked Supabase network.",
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
