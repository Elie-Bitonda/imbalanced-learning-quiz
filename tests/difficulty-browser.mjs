import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { defaultQuestions } from "../src/data/questions.js";
import { STORAGE_KEY } from "../src/data/repository.js";

const base = process.env.BASE_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL || "chrome",
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
page.setDefaultTimeout(10000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const button = (name) => page.getByRole("button", { name, exact: true });
const modeLink = (mode, manage = false) =>
  page
    .locator(manage ? ".manager-levels" : ".level-options")
    .getByRole("link", { name: new RegExp(`^${mode} `) });
const study = () =>
  page.getByRole("link", { name: "Study", exact: true }).click();
const manage = () =>
  page.getByRole("link", { name: "Question Manager", exact: true }).click();
const bank = () =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)).questions,
    STORAGE_KEY,
  );
const row = (text) =>
  page
    .locator(".question-row")
    .filter({ has: page.getByRole("heading", { name: text, exact: true }) });
const labels = {
  beginner: "Beginner",
  medium: "Medium",
  pro: "Pro",
  general: "General",
};
let scenarios = 0;
async function scenario(name, work) {
  await work();
  scenarios++;
  console.log(`PASS ${name}`);
}
async function author(level, question) {
  assert.equal(await page.getByLabel("Difficulty Level").inputValue(), level);
  await page.getByLabel("Question", { exact: true }).fill(question);
  for (let i = 1; i <= 4; i++)
    await page
      .getByRole("textbox", { name: `Answer ${i}`, exact: true })
      .fill(`Choice ${i}`);
  await page
    .getByRole("radio", { name: "Mark answer 1 correct", exact: true })
    .check();
  await page
    .getByLabel("Correct answer explanation")
    .fill("Choice 1 is the correct answer for this practice example.");
  await page.getByLabel("Tags").fill("classification");
  await button("Save question").click();
  await page.locator("dialog").waitFor({ state: "detached" });
}
async function assertModeCounts() {
  const rows = await bank();
  for (const mode of ["mixed", "beginner", "medium", "pro"]) {
    const count =
      mode === "mixed"
        ? rows.length
        : rows.filter((q) => q.difficulty === mode).length;
    const link = modeLink(mode === "mixed" ? "Mixed" : labels[mode]);
    assert.equal(
      await link.locator(".level-count").textContent(),
      String(count),
    );
  }
}

await mkdir("qa", { recursive: true });
try {
  await page.goto(`${base}/multiple-choice`);
  const old = defaultQuestions()[0];
  old.difficulty = "Medium";
  const legacy = {
    ...defaultQuestions()[0],
    question: "Legacy question without an assigned level",
    order: 1,
  };
  delete legacy.difficulty;
  const original = JSON.stringify({ version: 1, questions: [old, legacy] });
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
    key: STORAGE_KEY,
    raw: original,
  });
  await page.reload();
  await scenario(
    "legacy bank remains unchanged on read; Mixed includes legacy and known Medium questions",
    async () => {
      assert.equal(await page.locator(".page-count").textContent(), "1 / 2");
      const seenLevels = [await page.locator(".difficulty").textContent()];
      await page.locator(".answer").first().click();
      await button("Next").click();
      seenLevels.push(await page.locator(".difficulty").textContent());
      assert.deepEqual(seenLevels.sort(), ["General", "Medium"]);
      assert.equal(
        await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY),
        original,
      );
      await modeLink("Beginner").click();
      assert.ok(
        await page
          .getByRole("heading", { name: "No Beginner Questions Yet" })
          .isVisible(),
      );
      await modeLink("Pro").click();
      assert.ok(
        await page
          .getByRole("heading", { name: "No Pro Questions Yet" })
          .isVisible(),
      );
    },
  );
  await scenario(
    "study-level Add actions preselect Beginner, Medium and Pro and update Mixed without copies",
    async () => {
      for (const level of ["beginner", "medium", "pro"]) {
        await modeLink(labels[level]).click();
        await button(`Add ${labels[level]} Question`).click();
        await author(level, `${labels[level]} study sample`);
        const rows = await bank();
        assert.equal(
          rows.filter((q) => q.question === `${labels[level]} study sample`)
            .length,
          1,
        );
        assert.equal(
          rows.find((q) => q.question === `${labels[level]} study sample`)
            .difficulty,
          level,
        );
        await assertModeCounts();
      }
      assert.equal((await bank()).length, 5);
      assert.equal(
        (await bank()).find((q) => q.id === old.id).question,
        old.question,
      );
      assert.deepEqual(
        (await bank()).find((q) => q.id === legacy.id).answers,
        legacy.answers,
      );
    },
  );
  await scenario(
    "manager Add actions preselect each filter and search stays within that level",
    async () => {
      await manage();
      for (const level of ["beginner", "medium", "pro"]) {
        await modeLink(labels[level], true).click();
        await page.locator("#add-question").click();
        await author(level, `${labels[level]} manager sample`);
        await page.getByRole("searchbox").fill("classification");
        assert.equal(await page.locator(".question-row").count(), 2);
        for (const text of await page
          .locator(".question-summary h2")
          .allTextContents())
          assert.ok(text.startsWith(labels[level]));
        await page.getByRole("searchbox").fill("");
      }
      assert.equal((await bank()).length, 8);
      await modeLink("General / Legacy", true).click();
      assert.equal(await page.locator(".question-row").count(), 1);
      await page.reload();
      assert.ok(await row(legacy.question).isVisible());
    },
  );
  await scenario(
    "every mode renders only its levels and uses its own progress total",
    async () => {
      await study();
      await page.reload();
      const rows = await bank();
      for (const mode of ["beginner", "medium", "pro", "mixed"]) {
        await modeLink(mode === "mixed" ? "Mixed" : labels[mode]).click();
        const expected =
          mode === "mixed" ? rows : rows.filter((q) => q.difficulty === mode);
        assert.equal(
          await page.locator(".page-count").textContent(),
          `1 / ${expected.length}`,
        );
        const seen = [];
        for (let i = 0; i < expected.length; i++) {
          const text = await page.locator(".question-heading h2").textContent();
          const q = expected.find((item) => item.question === text);
          assert.ok(q);
          if (mode !== "mixed") assert.equal(q.id, expected[i].id);
          seen.push(q.id);
          assert.equal(
            await page.locator(".difficulty").textContent(),
            labels[q.difficulty],
          );
          await page.locator(".answer").first().click();
          if (i < expected.length - 1) await button("Next").click();
        }
        assert.deepEqual(seen.toSorted(), expected.map((q) => q.id).sort());
      }
      await assertModeCounts();
    },
  );
  await scenario(
    "switching modes preserves independent attempts, navigation and completion",
    async () => {
      await page.reload();
      await modeLink("Beginner").click();
      await page.locator(".answer").first().click();
      await button("Next").click();
      assert.equal(await page.locator(".page-count").textContent(), "2 / 2");
      await modeLink("Medium").click();
      assert.equal(await page.locator(".page-count").textContent(), "1 / 3");
      assert.equal(
        await page.locator('.answer[aria-pressed="true"]').count(),
        0,
      );
      await modeLink("Mixed").click();
      while (
        (await page.locator(".question-heading h2").textContent()) !==
        "Beginner study sample"
      ) {
        await page.locator(".answer").first().click();
        await button("Next").click();
      }
      assert.equal(
        await page.locator(".question-heading h2").textContent(),
        "Beginner study sample",
      );
      const mixedPosition = await page.locator(".page-count").textContent();
      assert.equal(
        await page.locator('.answer[aria-pressed="true"]').count(),
        0,
      );
      await modeLink("Beginner").click();
      assert.equal(await page.locator(".page-count").textContent(), "2 / 2");
      await button("Previous").click();
      assert.equal(await page.locator(".answer.correct").count(), 1);
      await button("Next").click();
      await page.locator(".answer").first().click();
      await button("Finish").click();
      await modeLink("Pro").click();
      assert.ok(await page.locator(".page-count").isVisible());
      await modeLink("Beginner").click();
      assert.ok(await button("Start a fresh session").isVisible());
      await button("Start a fresh session").click();
      await modeLink("Mixed").click();
      assert.equal(
        await page.locator(".page-count").textContent(),
        mixedPosition,
      );
    },
  );
  await scenario(
    "editing difficulty moves one existing ID, invalidates old attempts, and persists on refresh",
    async () => {
      const before = await bank();
      const target = before.find((q) => q.question === "Beginner study sample");
      await manage();
      await modeLink("Beginner", true).click();
      await row(target.question)
        .getByRole("button", { name: "Edit", exact: true })
        .click();
      assert.equal(
        await page.getByLabel("Difficulty Level").inputValue(),
        "beginner",
      );
      await page.getByLabel("Difficulty Level").selectOption("medium");
      await button("Save question").click();
      assert.equal(await row(target.question).count(), 0);
      await modeLink("Medium", true).click();
      assert.ok(await row(target.question).isVisible());
      await page.reload();
      assert.ok(await row(target.question).isVisible());
      const after = await bank();
      assert.equal(after.length, before.length);
      assert.equal(after.find((q) => q.id === target.id).difficulty, "medium");
      assert.deepEqual(
        after.find((q) => q.id === target.id).answers,
        target.answers,
      );
      await study();
      await assertModeCounts();
      await modeLink("Beginner").click();
      assert.equal(await page.locator(".page-count").textContent(), "1 / 1");
    },
  );
  await scenario(
    "duplicate inherits its level, can change level before Save, and Cancel creates nothing",
    async () => {
      await manage();
      await modeLink("Pro", true).click();
      const originalCount = (await bank()).length;
      await row("Pro study sample").locator("summary").click();
      await button("Duplicate").click();
      assert.equal(
        await page.getByLabel("Difficulty Level").inputValue(),
        "pro",
      );
      assert.equal((await bank()).length, originalCount);
      await button("Cancel").click();
      assert.equal((await bank()).length, originalCount);
      await row("Pro study sample").locator("summary").click();
      await button("Duplicate").click();
      await page.getByLabel("Difficulty Level").selectOption("beginner");
      await button("Save question").click();
      assert.equal((await bank()).length, originalCount + 1);
      await modeLink("Beginner", true).click();
      assert.ok(await row("Pro study sample (copy)").isVisible());
      assert.equal(
        (await bank()).find((q) => q.question === "Pro study sample")
          .difficulty,
        "pro",
      );
    },
  );
  await scenario(
    "filtered reorder persists and global deletion removes the record from Mixed",
    async () => {
      const before = await bank();
      const subset = before.filter((q) => q.difficulty === "beginner");
      const selected = row(subset[1].question);
      await selected
        .getByRole("button", { name: /Move question .* up/ })
        .click();
      await page.reload();
      assert.equal(
        await page.locator(".question-summary h2").first().textContent(),
        subset[1].question,
      );
      const after = await bank();
      assert.deepEqual(
        after.filter((q) => q.difficulty !== "beginner").map((q) => q.id),
        before.filter((q) => q.difficulty !== "beginner").map((q) => q.id),
      );
      await row(subset[1].question).locator("summary").click();
      await button("Delete").click();
      await button("Delete question").click();
      assert.equal(await row(subset[1].question).count(), 0);
      await modeLink("All", true).click();
      assert.equal(await row(subset[1].question).count(), 0);
      assert.equal((await bank()).length, before.length - 1);
    },
  );
  await scenario(
    "imports accept every new level and unassigned legacy data; exports include canonical levels",
    async () => {
      const incoming = ["beginner", "medium", "pro", "general", undefined].map(
        (difficulty, i) => ({
          ...defaultQuestions()[0],
          question: `Imported ${i}`,
          difficulty,
          order: i,
        }),
      );
      await button("Import").click();
      await page.locator("#import-file").setInputFiles({
        name: "levels.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(incoming)),
      });
      await page.getByText("5 questions ready to import").waitFor();
      await button("Import questions").click();
      const rows = await bank();
      assert.deepEqual(
        rows
          .filter((q) => q.question.startsWith("Imported"))
          .map((q) => q.difficulty),
        ["beginner", "medium", "pro", "general", "general"],
      );
      const downloadPromise = page.waitForEvent("download");
      await button("Export").click();
      const stream = await (await downloadPromise).createReadStream();
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const exported = JSON.parse(Buffer.concat(chunks).toString());
      assert.deepEqual(exported.questions, rows);
      await page.reload();
      assert.deepEqual(await bank(), rows);
    },
  );
  await scenario(
    "level URLs, browser history, keyboard selection, counts and responsive layout work",
    async () => {
      await study();
      await modeLink("Beginner").click();
      assert.ok(page.url().endsWith("?level=beginner"));
      await page.reload();
      assert.equal(
        await modeLink("Beginner").getAttribute("aria-current"),
        "page",
      );
      await modeLink("Pro").focus();
      await page.keyboard.press("Enter");
      await page.goBack();
      assert.equal(
        await modeLink("Beginner").getAttribute("aria-current"),
        "page",
      );
      await page.goForward();
      assert.equal(await modeLink("Pro").getAttribute("aria-current"), "page");
      for (const width of [1440, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        await study();
        await assertModeCounts();
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `study overflow at ${width}`,
        );
        if ([1440, 390].includes(width))
          await page.screenshot({
            path: `qa/difficulty-study-${width}.png`,
            fullPage: true,
            animations: "disabled",
          });
        await manage();
        await modeLink("Medium", true).click();
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `manager overflow at ${width}`,
        );
        if (width === 1440)
          await page.screenshot({
            path: "qa/difficulty-manager.png",
            fullPage: true,
            animations: "disabled",
          });
      }
    },
  );
  await scenario(
    "editing an earlier question in a completed level resumes at the unanswered question",
    async () => {
      const rows = [0, 1].map((i) => ({
        ...defaultQuestions()[0],
        question: `Pro review ${i}`,
        difficulty: "pro",
        order: i,
      }));
      await page.evaluate(
        ({ key, questions }) =>
          localStorage.setItem(key, JSON.stringify({ version: 1, questions })),
        { key: STORAGE_KEY, questions: rows },
      );
      await page.goto(`${base}/multiple-choice?level=pro`);
      await page.locator(".answer").first().click();
      await button("Next").click();
      await page.locator(".answer").first().click();
      await button("Finish").click();
      await manage();
      await row("Pro review 0")
        .getByRole("button", { name: "Edit", exact: true })
        .click();
      await page
        .getByLabel("Question", { exact: true })
        .fill("Pro review updated");
      await button("Save question").click();
      await study();
      await modeLink("Pro").click();
      assert.equal(
        await page.locator(".question-heading h2").textContent(),
        "Pro review updated",
      );
      assert.equal(await page.locator(".page-count").textContent(), "1 / 2");
      await page.locator(".answer").first().click();
      await button("Next").click();
      await button("Finish").click();
      assert.ok(await button("Start a fresh session").isVisible());
    },
  );
  assert.deepEqual(errors, []);
  console.log(
    `\n${scenarios} difficulty browser scenarios passed. Tests use isolated storage; the user's bank was not modified.`,
  );
} finally {
  await browser.close();
}
