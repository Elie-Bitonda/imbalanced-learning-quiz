import { chromium } from "playwright";
import assert from "node:assert/strict";
import { defaultQuestions } from "../src/data/questions.js";
import { STORAGE_KEY } from "../src/data/repository.js";

const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL || "chrome",
});
const page = await browser.newPage();
const base = process.env.BASE_URL || "http://127.0.0.1:4173";
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
// Reproducible randomness in this isolated test context only; no production hooks.
await page.addInitScript(() => {
  let seed = 12345;
  Math.random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
});
const button = (name) => page.getByRole("button", { name, exact: true });
const title = () => page.locator(".question-heading h2").textContent();
const bank = () =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)).questions,
    STORAGE_KEY,
  );
const manage = () =>
  page.getByRole("link", { name: "Question Manager", exact: true }).click();
const study = () =>
  page.getByRole("link", { name: "Study", exact: true }).click();
const row = (text) =>
  page
    .locator(".question-row")
    .filter({ has: page.getByRole("heading", { name: text, exact: true }) });
async function walk(checkNavigation = false) {
  const seen = [];
  while (true) {
    const current = await title();
    seen.push(current);
    if (
      (await page.locator(".answer").first().getAttribute("aria-disabled")) !==
      "true"
    )
      await page.locator(".answer").first().click();
    await button("Correct Answer Explained").click();
    assert.equal(await title(), current);
    await button("Correct Answer Explained").click();
    assert.equal(await title(), current);
    if (await button("Finish").count()) break;
    await button("Next").click();
    const next = await title();
    if (checkNavigation) {
      await button("Previous").click();
      assert.equal(await title(), current);
      await button("Next").click();
      assert.equal(await title(), next);
    }
    assert.ok(seen.length < 30, "Traversal must terminate");
  }
  return seen;
}
try {
  await page.goto(`${base}/multiple-choice`);
  const rows = [
    "beginner",
    "beginner",
    "beginner",
    "medium",
    "medium",
    "pro",
    "pro",
    "general",
  ].map((difficulty, order) => ({
    ...defaultQuestions()[0],
    difficulty,
    order,
    question: `Question ${order + 1} (${difficulty})`,
  }));
  const raw = JSON.stringify({ version: 1, questions: rows });
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
    key: STORAGE_KEY,
    raw,
  });
  await page.reload();
  const first = await walk(true);
  assert.deepEqual(first.toSorted(), rows.map((q) => q.question).sort());
  assert.notDeepEqual(
    first,
    rows.map((q) => q.question),
  );
  assert.notDeepEqual(
    first.map((text) => rows.find((q) => q.question === text).difficulty),
    rows.map((q) => q.difficulty),
  );
  await button("Finish").click();
  await button("Review answers").click();
  assert.deepEqual(await walk(), first);
  assert.equal(
    await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY),
    raw,
  );
  console.log(
    "PASS Mixed uses every record once in shuffled order, stable through Next/Previous, explanations and review",
  );

  await button("Finish").click();
  await button("Start a fresh session").click();
  const second = await walk();
  assert.notDeepEqual(second, first);
  const current = second.at(-1);
  await page
    .locator(".level-options")
    .getByRole("link", { name: /^Beginner / })
    .click();
  assert.equal(await title(), rows[0].question);
  await study();
  assert.equal(await title(), current);
  console.log(
    "PASS fresh Mixed sessions reshuffle while mode switching preserves their order and level ordering",
  );

  await manage();
  await row(second[1])
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await page.getByLabel("Difficulty Level").selectOption("pro");
  await button("Save question").click();
  await row(second[0]).locator("summary").click();
  await button("Delete").click();
  await button("Delete question").click();
  for (const difficulty of ["beginner", "medium", "pro"]) {
    await button("Add Question").click();
    await page
      .getByLabel("Question", { exact: true })
      .fill(`New ${difficulty}`);
    for (let i = 1; i <= 4; i++)
      await page
        .getByRole("textbox", { name: `Answer ${i}`, exact: true })
        .fill(`Answer ${i}`);
    await page
      .getByRole("radio", { name: "Mark answer 1 correct", exact: true })
      .check();
    await page
      .getByLabel("Correct answer explanation")
      .fill("Answer 1 explains this example.");
    await page.getByLabel("Difficulty Level").selectOption(difficulty);
    await button("Save question").click();
  }
  await study();
  assert.equal(await title(), current);
  assert.equal(
    await page.locator(".level-option.active .level-count").textContent(),
    "10",
  );
  while (await button("Previous").isEnabled()) await button("Previous").click();
  const updated = await walk();
  assert.deepEqual(updated.slice(0, 7), second.slice(1));
  assert.deepEqual(updated.slice(7).sort(), [
    "New beginner",
    "New medium",
    "New pro",
  ]);
  assert.equal((await bank()).length, 10);
  console.log(
    "PASS additions update Mixed automatically and deletions/level edits preserve surviving order and current position",
  );

  await button("Finish").click();
  await button("Start a fresh session").click();
  const latest = await walk();
  assert.deepEqual(
    latest.toSorted(),
    (await bank()).map((q) => q.question).sort(),
  );
  assert.ok(!latest.includes(second[0]));
  assert.ok(latest.includes(second[1]));
  assert.equal(new Set(latest).size, 10);
  assert.deepEqual(errors, []);
  console.log(
    "PASS future Mixed sessions include current additions and edits, omit deleted records, and never duplicate storage",
  );
  console.log("\n4 Mixed browser scenarios passed.");
} finally {
  await browser.close();
}
