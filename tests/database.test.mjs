import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { SharedQuestionRepository } from "../src/data/shared-repository.js";
import { defaultQuestions } from "../src/data/questions.js";

const editorId = "11111111-1111-4111-8111-111111111111";
const viewerId = "22222222-2222-4222-8222-222222222222";
test("shared PostgreSQL schema, repository, editor roles and transactions", async (t) => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;`);
  await db.exec(
    await readFile(
      "supabase/migrations/202609210001_shared_questions.sql",
      "utf8",
    ),
  );
  await db.query("insert into auth.users values($1,$2),($3,$4)", [
    editorId,
    "editor@example.test",
    viewerId,
    "viewer@example.test",
  ]);
  await db.query("insert into public.question_editors(user_id) values($1)", [
    editorId,
  ]);
  async function asUser(role, id, sql, parameters = []) {
    await db.exec("begin");
    try {
      await db.exec(`set local role ${role}`);
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [
        id || "",
      ]);
      const result = await db.query(sql, parameters);
      await db.exec("commit");
      return result;
    } catch (error) {
      await db.exec("rollback");
      throw error;
    }
  }
  function rpc(role, id) {
    return async (name, args = {}) => {
      let result;
      if (name === "read_question_bank")
        result = await asUser(
          role,
          id,
          "select public.read_question_bank() as data",
        );
      else
        result = await asUser(
          role,
          id,
          "select public.mutate_questions($1,$2,$3) as data",
          [args.action, JSON.stringify(args.payload), args.expected],
        );
      return result.rows[0].data;
    };
  }
  const a = new SharedQuestionRepository(rpc("authenticated", editorId));
  const b = new SharedQuestionRepository(rpc("anon", null));
  try {
    await t.test(
      "public readers cannot write and learners cannot elevate themselves",
      async () => {
        await b.refresh();
        assert.deepEqual(b.list(), []);
        await assert.rejects(
          () => b.save(defaultQuestions()[0]),
          /permission denied/,
        );
        await assert.rejects(
          () =>
            asUser(
              "authenticated",
              viewerId,
              "insert into public.question_editors(user_id) values($1)",
              [viewerId],
            ),
          /permission denied/,
        );
        await assert.rejects(
          () =>
            rpc("authenticated", viewerId)("mutate_questions", {
              action: "create",
              payload: defaultQuestions()[0],
            }),
          /authorized editor/,
        );
        await assert.rejects(
          () =>
            asUser(
              "authenticated",
              viewerId,
              "insert into public.questions(id,question,answers,explanation) values($1,$2,$3,$4)",
              [
                "denied",
                "Denied",
                JSON.stringify(defaultQuestions()[0].answers),
                "Denied",
              ],
            ),
          /row-level security/,
        );
      },
    );
    await t.test(
      "authorized creation shares all levels, counts, attribution and stable IDs between repositories",
      async () => {
        await a.refresh();
        for (const difficulty of ["beginner", "medium", "pro", "general"])
          await a.save({ ...defaultQuestions()[0], difficulty });
        await b.refresh();
        assert.equal(b.list().length, 4);
        assert.deepEqual(
          b.list().map((q) => q.difficulty),
          ["beginner", "medium", "pro", "general"],
        );
        assert.ok(b.list().every((q) => q.createdBy === editorId));
        assert.deepEqual(a.list(), b.list());
      },
    );
    await t.test(
      "database validates exactly one correct answer, answer IDs and nonempty text",
      async () => {
        for (const answers of [
          [],
          [{ id: "a", text: "Only one", isCorrect: true }],
          defaultQuestions()[0].answers.map((q) => ({ ...q, isCorrect: true })),
          defaultQuestions()[0].answers.map((q) => ({ ...q, id: "duplicate" })),
        ]) {
          await assert.rejects(
            () =>
              asUser(
                "authenticated",
                editorId,
                "insert into public.questions(id,question,answers,explanation) values($1,$2,$3,$4)",
                ["invalid", "Valid", JSON.stringify(answers), "Valid"],
              ),
            /check constraint/,
          );
        }
        await b.refresh();
        assert.equal(b.list().length, 4);
      },
    );
    await t.test(
      "edits persist and stale editors cannot silently overwrite or delete newer versions",
      async () => {
        const original = { ...a.list()[0] };
        await a.save({
          ...original,
          question: "Shared edit",
          difficulty: "pro",
        });
        await assert.rejects(
          () => a.save({ ...original, question: "Stale edit" }),
          /changed or deleted/,
        );
        const stale = new SharedQuestionRepository(
          rpc("authenticated", editorId),
        );
        stale.accept({ revision: b.version, questions: b.list() });
        await assert.rejects(() => stale.delete(original.id), /changed/);
        await b.refresh();
        assert.equal(b.list()[0].question, "Shared edit");
        assert.equal(b.list()[0].difficulty, "pro");
      },
    );
    await t.test(
      "duplicate, reorder and delete use transactional shared mutations",
      async () => {
        const source = a.list()[0];
        await a.duplicate(source.id);
        assert.equal(a.list().length, 5);
        const copy = a.list()[1];
        assert.notEqual(copy.id, source.id);
        assert.equal(copy.difficulty, source.difficulty);
        await a.move(copy.id, -1);
        assert.equal(a.list()[0].id, copy.id);
        await a.delete(copy.id);
        await b.refresh();
        assert.equal(b.list().length, 4);
      },
    );
    await t.test(
      "migration preserves legacy IDs, is idempotent, and never overwrites shared edits",
      async () => {
        const legacy = defaultQuestions()[0];
        delete legacy.difficulty;
        await a.migrate([legacy]);
        const imported = a.list().find((q) => q.id === legacy.id);
        assert.equal(imported.difficulty, "general");
        await a.save({ ...imported, question: "Edited shared legacy" });
        await a.migrate([legacy]);
        assert.equal(a.list().filter((q) => q.id === legacy.id).length, 1);
        assert.equal(
          a.list().find((q) => q.id === legacy.id).question,
          "Edited shared legacy",
        );
      },
    );
    await t.test(
      "imports are atomic and stale replace is rejected; export carries all questions",
      async () => {
        const before = a.list().length;
        await assert.rejects(
          () =>
            a.mutate("append", [
              defaultQuestions()[0],
              { ...defaultQuestions()[0], answers: [] },
            ]),
          /check constraint/,
        );
        await b.refresh();
        assert.equal(b.list().length, before);
        await a.import([defaultQuestions()[0]], "append");
        await assert.rejects(
          () => a.mutate("replace", [], b.version),
          /bank changed/,
        );
        assert.equal(JSON.parse(a.export()).questions.length, before + 1);
        await a.import([defaultQuestions()[0]], "replace");
        await b.refresh();
        assert.equal(b.list().length, 1);
      },
    );
  } finally {
    await db.close();
  }
});
