import { test } from "node:test";
import assert from "node:assert/strict";
import { QuestionRepository, STORAGE_KEY } from "../src/data/repository.js";
import {
  defaultQuestions,
  duplicateQuestion,
  emptyQuestion,
} from "../src/data/questions.js";
import { parseBank, validateQuestion } from "../src/data/validation.js";
import {
  normalizeDifficulty,
  questionsForMode,
  modeFromQuery,
} from "../src/data/difficulty.js";

function question(difficulty, order = 0) {
  return { ...defaultQuestions()[0], difficulty, order };
}
function repository(rows) {
  const store = new Map([
    [STORAGE_KEY, JSON.stringify({ version: 1, questions: rows })],
  ]);
  const adapter = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
  };
  return { repo: new QuestionRepository(adapter), store, adapter };
}

test("each level isolates its own records; Mixed preserves identity, order and general questions", () => {
  const bank = ["beginner", "beginner", "medium", "pro", "general"].map(
    question,
  );
  for (const level of ["beginner", "medium", "pro", "general"]) {
    const subset = questionsForMode(bank, level);
    assert.ok(subset.every((q) => q.difficulty === level));
    assert.equal(subset.length, level === "beginner" ? 2 : 1);
  }
  assert.equal(questionsForMode(bank, "mixed"), bank);
  assert.equal(
    new Set(questionsForMode(bank, "mixed").map((q) => q.id)).size,
    5,
  );
});

test("legacy normalization preserves IDs, content, timestamps, order and raw storage without writes", () => {
  const original = ["Easy", "Medium", "Hard", undefined, null, ""].map(
    question,
  );
  const { repo, store } = repository(original);
  const raw = store.get(STORAGE_KEY);
  const loaded = repo.list();
  assert.deepEqual(
    loaded.map((q) => q.difficulty),
    ["beginner", "medium", "pro", "general", "general", "general"],
  );
  for (const [i, q] of loaded.entries()) {
    assert.deepEqual({ ...q, difficulty: original[i].difficulty }, original[i]);
  }
  assert.equal(store.get(STORAGE_KEY), raw);
  assert.equal(questionsForMode(loaded, "mixed").length, 6);
});

test("reading a legacy bank works even if storage is read-only", () => {
  const q = question(undefined);
  const repo = new QuestionRepository({
    getItem: () => JSON.stringify([q]),
    setItem: () => {
      throw new Error("No writes allowed");
    },
  });
  assert.equal(repo.list()[0].difficulty, "general");
});

test("new defaults are explicit and the original seed retains its known Medium classification", () => {
  assert.equal(emptyQuestion().difficulty, "general");
  for (const level of ["beginner", "medium", "pro"])
    assert.equal(emptyQuestion(level).difficulty, level);
  assert.equal(defaultQuestions()[0].difficulty, "medium");
  assert.equal(
    defaultQuestions()[0].question,
    "What is the central concern of imbalanced learning?",
  );
});

test("legacy and canonical imports validate; unknown levels are rejected atomically", () => {
  const rows = [
    "beginner",
    "medium",
    "pro",
    "general",
    "Easy",
    "Medium",
    "Hard",
    undefined,
  ].map(question);
  const parsed = parseBank(JSON.stringify(rows));
  assert.deepEqual(
    parsed.map((q) => q.difficulty),
    [
      "beginner",
      "medium",
      "pro",
      "general",
      "beginner",
      "medium",
      "pro",
      "general",
    ],
  );
  const { repo, store } = repository([question("medium")]);
  const raw = store.get(STORAGE_KEY);
  for (const invalid of ["Mixed", "expert", 123, {}, true]) {
    assert.equal(normalizeDifficulty(invalid), undefined);
    assert.ok(validateQuestion(question(invalid)).length);
    assert.throws(
      () => repo.import([question("beginner"), question(invalid)], "append"),
      /difficulty/,
    );
    assert.throws(() => repo.save(question(invalid)), /difficulty/);
    assert.equal(store.get(STORAGE_KEY), raw);
  }
});

test("saving levels, moving between levels, deletion, and export use one persistent record", () => {
  const { repo, adapter } = repository([]);
  for (const level of ["beginner", "medium", "pro"]) repo.save(question(level));
  assert.equal(repo.list().length, 3);
  const beginner = repo.list().find((q) => q.difficulty === "beginner");
  repo.save({ ...beginner, difficulty: "medium" });
  const fresh = new QuestionRepository(adapter).list();
  assert.equal(fresh.length, 3);
  assert.equal(fresh.find((q) => q.id === beginner.id).difficulty, "medium");
  assert.equal(questionsForMode(fresh, "beginner").length, 0);
  assert.equal(questionsForMode(fresh, "medium").length, 2);
  assert.deepEqual(
    JSON.parse(repo.export()).questions.map((q) => q.difficulty),
    ["medium", "medium", "pro"],
  );
  repo.delete(beginner.id);
  assert.equal(questionsForMode(repo.list(), "mixed").length, 2);
  assert.equal(questionsForMode(repo.list(), "medium").length, 1);
});

test("duplicate is a same-level draft until saved and may change level without changing its source", () => {
  const source = question("pro");
  const { repo } = repository([source]);
  const draft = duplicateQuestion(source);
  assert.equal(draft.difficulty, "pro");
  assert.equal(repo.list().length, 1);
  draft.difficulty = "beginner";
  repo.duplicate(source.id, draft);
  assert.equal(repo.list()[0].difficulty, "pro");
  assert.equal(repo.list()[1].difficulty, "beginner");
  assert.notEqual(draft.id, source.id);
});

test("level reorder swaps only that level, retaining other levels and stable answer IDs", () => {
  const bank = ["beginner", "medium", "beginner", "pro"].map(question);
  const { repo } = repository(bank);
  repo.move(bank[2].id, -1, "beginner");
  assert.deepEqual(
    repo.list().map((q) => q.id),
    [bank[2].id, bank[1].id, bank[0].id, bank[3].id],
  );
  assert.deepEqual(repo.list()[0].answers, bank[2].answers);
});

test("level URLs resolve safely, with General available only in management", () => {
  assert.equal(modeFromQuery(null), "mixed");
  assert.equal(modeFromQuery("unknown"), "mixed");
  assert.equal(modeFromQuery("general"), "mixed");
  assert.equal(modeFromQuery("general", true), "general");
  assert.equal(modeFromQuery("beginner"), "beginner");
});
