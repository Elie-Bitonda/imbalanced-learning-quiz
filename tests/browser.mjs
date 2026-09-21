import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const base = process.env.BASE_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL || "chrome",
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("response", (response) => {
  if (response.url().startsWith(base) && response.status() >= 400)
    errors.push(`${response.status()} ${response.url()}`);
});
const button = (name) => page.getByRole("button", { name, exact: true });
const count = async (locator, expected) =>
  assert.equal(await locator.count(), expected);
const visible = async (locator) =>
  assert.equal(await locator.isVisible(), true);
const enabled = async (locator) =>
  assert.equal(await locator.isEnabled(), true);
const disabled = async (locator) =>
  assert.equal(await locator.isDisabled(), true);
const manage = () =>
  page.getByRole("link", { name: "Question Manager", exact: true }).click();
const study = () =>
  page.getByRole("link", { name: "Study", exact: true }).click();
const more = async (row = 0) =>
  page.locator(".question-row").nth(row).locator("summary").click();
let assertions = 0;
async function scenario(name, work) {
  await work();
  assertions++;
  console.log(`PASS ${name}`);
}
await mkdir("qa", { recursive: true });
try {
  await page.goto(`${base}/multiple-choice`);
  await scenario(
    "seed, question, answers, initial progress and disabled controls",
    async () => {
      await visible(
        page.getByRole("heading", {
          name: "What is the central concern of imbalanced learning?",
        }),
      );
      await count(page.locator(".answer"), 4);
      await disabled(button("Correct Answer Explained"));
      await disabled(button("Finish"));
      await disabled(button("Previous"));
      assert.equal(await page.locator(".page-count").textContent(), "1 / 1");
      await page.screenshot({
        path: "qa/study-desktop.png",
        fullPage: true,
        animations: "disabled",
      });
    },
  );
  await scenario(
    "keyboard correct selection, green state, lock and explanation toggle",
    async () => {
      await page.locator(".answer").nth(1).focus();
      await page.keyboard.press("Space");
      await count(page.locator(".answer.correct"), 1);
      await count(page.locator(".answer.incorrect"), 0);
      await enabled(button("Correct Answer Explained"));
      await enabled(button("Finish"));
      assert.equal(
        await page.locator(".answer.correct").getAttribute("aria-pressed"),
        "true",
      );
      // Deliberately dispatch a click to verify the handler also locks answers.
      await page.locator(".answer").nth(0).click({ force: true });
      await count(page.locator(".answer.incorrect"), 0);
      await button("Correct Answer Explained").click();
      await visible(page.locator("#explanation-panel"));
      assert.equal(
        await button("Correct Answer Explained").getAttribute("aria-expanded"),
        "true",
      );
      await button("Correct Answer Explained").click();
      assert.equal(await page.locator("#explanation-panel").isHidden(), true);
    },
  );
  await scenario(
    "finish, score, review and deliberate fresh attempt",
    async () => {
      await button("Finish").click();
      await visible(button("Start a fresh session"));
      assert.match(await page.locator(".score").textContent(), /1 \/ 1/);
      await button("Review answers").click();
      await count(page.locator(".answer.correct"), 1);
      await button("Finish").click();
      await button("Start a fresh session").click();
      await disabled(button("Finish"));
    },
  );
  await scenario(
    "wrong selection turns red, reveals green correct answer and explanation",
    async () => {
      await page.locator(".answer").nth(0).focus();
      await page.keyboard.press("Enter");
      await count(page.locator(".answer.incorrect"), 1);
      await count(page.locator(".answer.correct"), 1);
      await count(page.locator('.answer[aria-pressed="true"]'), 1);
      assert.notEqual(
        await page
          .locator(".answer.incorrect")
          .evaluate((el) => getComputedStyle(el).backgroundColor),
        await page
          .locator(".answer.correct")
          .evaluate((el) => getComputedStyle(el).backgroundColor),
      );
      await button("Correct Answer Explained").click();
      await visible(
        page.getByText("Imbalanced learning addresses the performance", {
          exact: false,
        }),
      );
      await page.screenshot({
        path: "qa/study-feedback.png",
        fullPage: true,
        animations: "disabled",
      });
    },
  );
  await manage();
  await scenario(
    "authoring validates required fields, minimum answers and exactly one correct",
    async () => {
      await button("Add Question").click();
      await button("Save question").click();
      await visible(page.getByText("Write a question.", { exact: true }));
      await visible(
        page.getByText("Select exactly one correct answer.", { exact: true }),
      );
      await button("Remove answer 4").click();
      await button("Remove answer 3").click();
      await disabled(button("Remove answer 2"));
      await page
        .getByLabel("Question", { exact: true })
        .fill("Which value is an even number?");
      await page
        .getByRole("textbox", { name: "Answer 1", exact: true })
        .fill("Three");
      await page
        .getByRole("textbox", { name: "Answer 2", exact: true })
        .fill("Four");
      await page
        .getByRole("radio", { name: "Mark answer 2 correct", exact: true })
        .check();
      await page
        .getByLabel("Correct answer explanation")
        .fill("Four is divisible by two with no remainder.");
      await page
        .getByLabel("Category Optional", { exact: true })
        .fill("Mathematics");
      await page.getByLabel("Tags").fill("Numbers, Basics");
    },
  );
  await scenario(
    "dynamic answers, reorder and isolated preview before save",
    async () => {
      await button("Add another answer").click();
      await page
        .getByRole("textbox", { name: "Answer 3", exact: true })
        .fill("Five");
      await button("Add another answer").click();
      await page
        .getByRole("textbox", { name: "Answer 4", exact: true })
        .fill("Seven");
      await button("Add another answer").click();
      await page
        .getByRole("textbox", { name: "Answer 5", exact: true })
        .fill("Nine");
      await button("Move answer 2 up").click();
      assert.equal(
        await page
          .getByRole("radio", { name: "Mark answer 1 correct", exact: true })
          .isChecked(),
        true,
      );
      await button("Preview").click();
      await count(page.locator(".preview-modal .answer"), 5);
      await page.locator(".preview-modal .answer").first().click();
      await count(page.locator(".preview-modal .answer.correct"), 1);
      await button("Back").click();
      await page.screenshot({
        path: "qa/question-editor.png",
        fullPage: true,
        animations: "disabled",
      });
      await button("Save question").click();
      await count(page.locator(".question-row"), 2);
    },
  );
  await scenario(
    "next, previous, progress and preserved attempts",
    async () => {
      await study();
      await count(page.locator(".answer.incorrect"), 1);
      await button("Next").click();
      assert.equal(await page.locator(".page-count").textContent(), "2 / 2");
      await disabled(button("Finish"));
      await page.locator(".answer").first().click();
      await button("Previous").click();
      assert.equal(await page.locator(".page-count").textContent(), "1 / 2");
      await count(page.locator(".answer.incorrect"), 1);
      await button("Next").click();
      await count(page.locator(".answer.correct"), 1);
    },
  );
  await scenario(
    "editing prepopulates values and switching correct answers preserves text",
    async () => {
      await manage();
      await page
        .locator(".question-row")
        .nth(1)
        .getByRole("button", { name: "Edit", exact: true })
        .click();
      assert.equal(
        await page
          .getByRole("textbox", { name: "Answer 1", exact: true })
          .inputValue(),
        "Four",
      );
      await page
        .getByLabel("Question", { exact: true })
        .fill("Which value is an odd number?");
      await page
        .getByRole("radio", { name: "Mark answer 2 correct", exact: true })
        .check();
      await page
        .getByLabel("Correct answer explanation")
        .fill("Three is not divisible by two.");
      await button("Save question").click();
      assert.match(
        await page.locator(".question-row").nth(1).textContent(),
        /Correct: Three/,
      );
      await study();
      await disabled(button("Finish"));
      await manage();
    },
  );
  await scenario(
    "duplicate, persisted reorder, search and category filtering",
    async () => {
      await more(1);
      await button("Duplicate").click();
      await button("Save question").click();
      await count(page.locator(".question-row"), 3);
      await button("Move question 3 up").click();
      assert.match(
        await page.locator(".question-row").nth(1).textContent(),
        /\(copy\)/,
      );
      await page.reload();
      assert.match(
        await page.locator(".question-row").nth(1).textContent(),
        /\(copy\)/,
      );
      await page.getByRole("searchbox").fill("copy");
      await count(page.locator(".question-row"), 1);
      await page.getByRole("searchbox").fill("");
      await page
        .getByLabel("Filter by category")
        .selectOption("Machine learning");
      await count(page.locator(".question-row"), 1);
      await page.getByLabel("Filter by category").selectOption("");
      await count(page.locator(".question-row"), 3);
      await page.screenshot({
        path: "qa/question-manager.png",
        fullPage: true,
        animations: "disabled",
      });
    },
  );
  await scenario(
    "delete confirmation can cancel, then delete persistently",
    async () => {
      await more(1);
      await button("Delete").click();
      await button("Cancel").click();
      await count(page.locator(".question-row"), 3);
      await more(1);
      await button("Delete").click();
      await button("Delete question").click();
      await count(page.locator(".question-row"), 2);
      await page.reload();
      await count(page.locator(".question-row"), 2);
    },
  );
  await scenario(
    "cancel preserves data and unsaved changes require deliberate discard",
    async () => {
      await button("Add Question").click();
      await page.getByLabel("Question", { exact: true }).fill("Discard me");
      await button("Cancel").click();
      await button("Keep editing").click();
      assert.equal(
        await page.getByLabel("Question", { exact: true }).inputValue(),
        "Discard me",
      );
      await page.keyboard.press("Escape");
      await button("Discard changes").click();
      await count(page.locator(".question-row"), 2);
    },
  );
  const exported = await page.evaluate(() =>
    localStorage.getItem("forma.multiple-choice.questions.v1"),
  );
  await scenario("export downloads valid JSON", async () => {
    const downloadPromise = page.waitForEvent("download");
    await button("Export").click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), "forma-question-bank.json");
  });
  await scenario(
    "invalid import is rejected and valid import shows count before committing",
    async () => {
      await button("Import").click();
      await page.locator("#import-file").setInputFiles({
        name: "invalid.json",
        mimeType: "application/json",
        buffer: Buffer.from("{bad"),
      });
      await page
        .getByText("This file is not valid JSON.", { exact: false })
        .waitFor();
      await disabled(button("Import questions"));
      await page.locator("#import-file").setInputFiles({
        name: "invalid-schema.json",
        mimeType: "application/json",
        buffer: Buffer.from("[{}]"),
      });
      await page.getByText("Question 1:", { exact: false }).waitFor();
      await disabled(button("Import questions"));
      await page.locator("#import-file").setInputFiles({
        name: "bank.json",
        mimeType: "application/json",
        buffer: Buffer.from(exported),
      });
      await page.getByText("2 questions ready to import").waitFor();
      await enabled(button("Import questions"));
      await button("Import questions").click();
      await count(page.locator(".question-row"), 4);
      const ids = await page.evaluate(() =>
        JSON.parse(
          localStorage.getItem("forma.multiple-choice.questions.v1"),
        ).questions.map((q) => q.id),
      );
      assert.equal(new Set(ids).size, 4);
    },
  );
  await scenario(
    "replace import requires acknowledgement and can produce persistent empty bank",
    async () => {
      await button("Import").click();
      await page.locator("#import-file").setInputFiles({
        name: "empty.json",
        mimeType: "application/json",
        buffer: Buffer.from("[]"),
      });
      await page.getByText("0 questions ready to import").waitFor();
      await page
        .getByRole("radio", {
          name: "Replace existing questions",
          exact: false,
        })
        .check();
      await disabled(button("Import questions"));
      await page.getByRole("checkbox").check();
      await button("Import questions").click();
      await visible(page.getByRole("heading", { name: "No questions yet" }));
      await page.reload();
      await count(page.locator(".question-row"), 0);
      await study();
      await visible(
        page.getByText("No multiple-choice questions are available yet."),
      );
    },
  );
  await page.evaluate(
    (value) =>
      localStorage.setItem("forma.multiple-choice.questions.v1", value),
    exported,
  );
  await page.reload();
  await scenario(
    "responsive study, manager and editor have no horizontal overflow",
    async () => {
      for (const width of [1440, 1024, 768, 540, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await study();
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `study overflow ${width}`,
        );
        if (width < 541)
          assert.equal(
            await page
              .locator(".answers")
              .evaluate(
                (el) =>
                  getComputedStyle(el).gridTemplateColumns.split(" ").length,
              ),
            1,
          );
        await page.locator(".answer").first().click({ force: true });
        if (
          (await button("Correct Answer Explained").getAttribute(
            "aria-expanded",
          )) !== "true"
        )
          await button("Correct Answer Explained").click();
        if (width === 390)
          await page.screenshot({
            path: "qa/study-mobile.png",
            fullPage: true,
            animations: "disabled",
          });
        await manage();
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `manager overflow ${width}`,
        );
        await button("Add Question").click();
        assert.ok(
          await page
            .locator("dialog")
            .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
          `editor overflow ${width}`,
        );
        if (width === 390)
          await page.screenshot({
            path: "qa/editor-mobile.png",
            fullPage: true,
            animations: "disabled",
          });
        await button("Cancel").click();
      }
    },
  );
  await scenario(
    "author content is escaped, long text wraps, and reduced motion is respected",
    async () => {
      await page.evaluate(() => {
        const data = JSON.parse(
          localStorage.getItem("forma.multiple-choice.questions.v1"),
        );
        data.questions[0].question =
          "<img src=x onerror=alert(1)>" + "long".repeat(100);
        data.questions[0].answers[0].text = "word".repeat(160);
        localStorage.setItem(
          "forma.multiple-choice.questions.v1",
          JSON.stringify(data),
        );
      });
      await study();
      await count(page.locator(".question-heading img"), 0);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page.emulateMedia({ reducedMotion: "reduce" });
      assert.equal(
        await page
          .locator(".answer")
          .first()
          .evaluate((el) => getComputedStyle(el).transitionDuration),
        "0s",
      );
    },
  );
  await scenario(
    "modal keyboard focus stays contained and returns to its trigger",
    async () => {
      await manage();
      await button("Add Question").click();
      for (let i = 0; i < 28; i++) {
        await page.keyboard.press("Tab");
        assert.ok(
          await page.evaluate(
            () => !!document.activeElement?.closest("dialog"),
          ),
        );
      }
      await page.keyboard.press("Escape");
      await page.locator("dialog").waitFor({ state: "detached" });
      await count(page.locator("dialog"), 0);
      assert.equal(
        await button("Add Question").evaluate(
          (el) => el === document.activeElement,
        ),
        true,
      );
    },
  );
  await scenario(
    "failed storage write keeps the draft and previous bank intact",
    async () => {
      await page.evaluate(
        (value) =>
          localStorage.setItem("forma.multiple-choice.questions.v1", value),
        exported,
      );
      await page.reload();
      const before = await page.evaluate(() =>
        localStorage.getItem("forma.multiple-choice.questions.v1"),
      );
      await page
        .locator(".question-row")
        .first()
        .getByRole("button", { name: "Edit", exact: true })
        .click();
      await page
        .getByLabel("Question", { exact: true })
        .fill("Unsaved revision");
      await page.evaluate(() => {
        Storage.prototype.setItem = () => {
          throw new DOMException("Storage full", "QuotaExceededError");
        };
      });
      await button("Save question").click();
      await visible(
        page.getByText("Your changes could not be saved.", { exact: false }),
      );
      assert.equal(
        await page.getByLabel("Question", { exact: true }).inputValue(),
        "Unsaved revision",
      );
      assert.equal(
        await page.evaluate(() =>
          localStorage.getItem("forma.multiple-choice.questions.v1"),
        ),
        before,
      );
      await button("Cancel").click();
      await button("Discard changes").click();
      await page.reload();
    },
  );
  await scenario(
    "browser history changes views without resetting learner attempts",
    async () => {
      await study();
      await page.locator(".answer").first().click();
      await manage();
      await page.goBack();
      await count(page.locator(".answer.incorrect"), 1);
      await page.goForward();
      await visible(
        page.getByRole("heading", { name: "Multiple Choice Questions" }),
      );
    },
  );
  await scenario(
    "corrupt storage error preserves original data and offers recovery",
    async () => {
      await page.evaluate(() =>
        localStorage.setItem("forma.multiple-choice.questions.v1", "{broken"),
      );
      await page.reload();
      await visible(
        page.getByRole("heading", {
          name: "We couldn’t open your question bank",
        }),
      );
      assert.equal(
        await page.evaluate(() =>
          localStorage.getItem("forma.multiple-choice.questions.v1"),
        ),
        "{broken",
      );
      await visible(button("Download stored data"));
    },
  );
  assert.deepEqual(errors, []);
  console.log(
    `\n${assertions} browser scenarios passed. No console errors or failed app requests. Screenshots: qa/`,
  );
} finally {
  await browser.close();
}
