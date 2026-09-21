import { test } from "node:test";
import assert from "node:assert/strict";
import { QuestionRepository, STORAGE_KEY } from "../src/data/repository.js";
import { defaultQuestions, emptyQuestion } from "../src/data/questions.js";
import { validateQuestion, parseBank } from "../src/data/validation.js";
function setup() {
  const store = new Map();
  const repo = new QuestionRepository({
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
  });
  return { repo, store };
}
test("first run seeds once; data survives a new repository instance", () => {
  const { repo } = setup();
  const first = repo.list();
  assert.equal(first.length, 1);
  assert.equal(
    first[0].answers.find((a) => a.isCorrect).text,
    "Learning effectively when classes are severely underrepresented or unevenly distributed",
  );
  assert.deepEqual(new QuestionRepository(repo.storage).list(), first);
});
test("create, edit and delete persist; an empty bank is not reseeded", () => {
  const { repo } = setup();
  const q = defaultQuestions()[0];
  repo.save(q);
  assert.equal(repo.list().length, 2);
  q.question = "Edited question";
  repo.save(q);
  assert.equal(
    repo.list().find((item) => item.id === q.id).question,
    q.question,
  );
  for (const item of repo.list()) repo.delete(item.id);
  assert.deepEqual(repo.list(), []);
});
test("duplicate uses fresh question and answer IDs", () => {
  const { repo } = setup();
  const q = repo.list()[0];
  repo.duplicate(q.id);
  const copy = repo.list()[1];
  assert.notEqual(q.id, copy.id);
  assert.ok(copy.answers.every((a) => !q.answers.some((b) => b.id === a.id)));
  assert.equal(copy.answers.filter((a) => a.isCorrect).length, 1);
});
test("reorder persists and preserves the correct answer by ID", () => {
  const { repo } = setup();
  const q = repo.list()[0];
  repo.duplicate(q.id);
  const copy = repo.list()[1];
  repo.move(copy.id, -1);
  assert.equal(repo.list()[0].id, copy.id);
  const correct = copy.answers.find((a) => a.isCorrect).id;
  copy.answers.reverse();
  repo.save(copy);
  assert.equal(repo.list()[0].answers.find((a) => a.isCorrect).id, correct);
});
test("validation rejects blank fields, empty choices, missing and multiple correct answers", () => {
  assert.ok(validateQuestion(emptyQuestion()).length >= 3);
  const q = defaultQuestions()[0];
  q.answers[0].isCorrect = true;
  assert.match(validateQuestion(q).join(" "), /exactly one/);
  q.answers = [];
  assert.match(validateQuestion(q).join(" "), /at least two/);
});
test("malformed JSON, schema versions and invalid metadata are rejected", () => {
  for (const raw of ["{", "{}", '{"version":2,"questions":[]}', "[null]"])
    assert.throws(() => parseBank(raw));
  const q = defaultQuestions()[0];
  q.createdAt = "not a date";
  assert.throws(() => parseBank(JSON.stringify([q])), /valid date/);
});
test("import validates all records atomically, regenerates duplicate IDs and supports replace", () => {
  const { repo } = setup();
  const before = repo.list();
  const bad = { ...before[0], explanation: "" };
  assert.throws(() => repo.import([before[0], bad], "append"));
  assert.deepEqual(repo.list(), before);
  repo.import([before[0], before[0]], "append");
  assert.equal(new Set(repo.list().map((q) => q.id)).size, 3);
  repo.import([before[0]], "replace");
  assert.equal(repo.list().length, 1);
  assert.deepEqual(parseBank(repo.export()), repo.list());
});
test("corrupt storage is never overwritten; storage failure is reported", () => {
  const { repo, store } = setup();
  store.set(STORAGE_KEY, "{broken");
  assert.throws(() => repo.list());
  assert.equal(store.get(STORAGE_KEY), "{broken");
  const blocked = new QuestionRepository({
    getItem: () => null,
    setItem: () => {
      throw new Error("Quota");
    },
  });
  assert.throws(() => blocked.list(), /could not be saved/);
});
