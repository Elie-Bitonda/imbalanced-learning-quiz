import { test } from "node:test";
import assert from "node:assert/strict";
import { SessionOrder, shuffle } from "../src/data/session-order.js";
import { defaultQuestions } from "../src/data/questions.js";
import { QuestionRepository, STORAGE_KEY } from "../src/data/repository.js";
import { questionsForMode } from "../src/data/difficulty.js";

const fixture = () =>
  ["beginner", "beginner", "medium", "medium", "pro", "pro", "general"].map(
    (difficulty, order) => ({ ...defaultQuestions()[0], difficulty, order }),
  );
const ids = (questions) => questions.map((q) => q.id);

test("Fisher–Yates uses bounded swaps without mutating the source", () => {
  const input = [1, 2, 3, 4];
  assert.deepEqual(
    shuffle(input, () => 0),
    [2, 3, 4, 1],
  );
  assert.deepEqual(input, [1, 2, 3, 4]);
  assert.deepEqual(
    shuffle([], () => 0),
    [],
  );
  assert.deepEqual(
    shuffle([1], () => 0),
    [1],
  );
});

test("Mixed starts shuffled across all levels with original records exactly once", () => {
  const bank = fixture();
  const session = new SessionOrder(() => 0.4);
  const order = session.resolve(bank);
  assert.notDeepEqual(ids(order), ids(bank));
  assert.notDeepEqual(
    order.map((q) => q.difficulty),
    bank.map((q) => q.difficulty),
  );
  assert.deepEqual(ids(order).sort(), ids(bank).sort());
  assert.ok(order.every((q) => bank.includes(q)));
  assert.equal(new Set(ids(order)).size, bank.length);
});

test("rerenders and manager reordering consume no randomness or change session order", () => {
  const bank = fixture();
  let calls = 0;
  const session = new SessionOrder(() => {
    calls++;
    return 0.3;
  });
  const first = ids(session.resolve(bank));
  const count = calls;
  for (let i = 0; i < 20; i++)
    assert.deepEqual(ids(session.resolve([...bank].reverse())), first);
  assert.equal(calls, count);
});

test("only explicit reset reshuffles, and a new session can have a different order", () => {
  const bank = fixture();
  let random = 0.2;
  const session = new SessionOrder(() => random);
  const first = ids(session.resolve(bank));
  random = 0.8;
  assert.deepEqual(ids(session.resolve(bank)), first);
  session.reset();
  assert.notDeepEqual(ids(session.resolve(bank)), first);
});

test("new Beginner, Medium and Pro questions join Mixed once without disturbing current order", () => {
  const rows = fixture();
  let raw = JSON.stringify({ version: 1, questions: rows });
  const repository = new QuestionRepository({
    getItem: (key) => (key === STORAGE_KEY ? raw : null),
    setItem: (_key, value) => {
      raw = value;
    },
  });
  const session = new SessionOrder(() => 0.4);
  const first = ids(session.resolve(repository.list()));
  for (const difficulty of ["beginner", "medium", "pro"])
    repository.save({ ...defaultQuestions()[0], difficulty });
  const bank = repository.list();
  const result = session.resolve(questionsForMode(bank, "mixed"));
  assert.equal(result.length, rows.length + 3);
  assert.deepEqual(ids(result).slice(0, rows.length), first);
  assert.deepEqual(ids(result).sort(), ids(bank).sort());
  const stored = raw;
  session.reset();
  session.resolve(bank);
  assert.equal(raw, stored);
});

test("deletions disappear, edits stay in place, and a reset uses the current bank", () => {
  const bank = fixture();
  const session = new SessionOrder(() => 0.4);
  const order = session.resolve(bank);
  const removed = order[0];
  const edited = order[1];
  const updated = bank
    .filter((q) => q.id !== removed.id)
    .map((q) =>
      q.id === edited.id
        ? { ...q, difficulty: "pro", question: "Updated content" }
        : q,
    );
  const result = session.resolve(updated);
  assert.deepEqual(ids(result), ids(order).slice(1));
  assert.equal(result[0].question, "Updated content");
  assert.equal(result[0].difficulty, "pro");
  session.reset();
  assert.deepEqual(ids(session.resolve(updated)).sort(), ids(updated).sort());
  assert.deepEqual(session.resolve([]), []);
});
