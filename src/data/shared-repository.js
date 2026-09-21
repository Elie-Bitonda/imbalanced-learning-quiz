import { parseBank, validateQuestion } from "./validation.js";
import { duplicateQuestion, newId } from "./questions.js";
import { questionsForMode } from "./difficulty.js";
/** @typedef {import('../models').Question} Question */
/** @typedef {(name: string, args?: Record<string, unknown>) => Promise<unknown>} Rpc */

/** A synchronous read cache plus async, transactional database mutations. No local writes. */
export class SharedQuestionRepository {
  /** @param {Rpc} rpc */
  constructor(rpc) {
    this.rpc = rpc;
    /** @type {Question[]} */ this.questions = [];
    this.version = "";
    this.requestSequence = 0;
  }
  list() {
    return this.questions;
  }
  /** @param {unknown} snapshot */
  accept(snapshot) {
    if (
      !snapshot ||
      typeof snapshot !== "object" ||
      !("questions" in snapshot) ||
      !("revision" in snapshot) ||
      typeof snapshot.revision !== "string"
    )
      throw new Error("The shared bank returned an invalid response.");
    if (!/^\d+$/.test(snapshot.revision))
      throw new Error("Invalid shared bank version.");
    if (this.version && BigInt(snapshot.revision) < BigInt(this.version))
      return this.questions;
    const questions = parseBank(JSON.stringify(snapshot.questions));
    const rows =
      /** @type {Array<{revision?: string, createdBy?: string | null}>} */ (
        snapshot.questions
      );
    if (
      new Set(questions.map((q) => q.id)).size !== questions.length ||
      rows.some((q) => typeof q.revision !== "string")
    )
      throw new Error("The shared bank contains invalid revisions or IDs.");
    this.questions = questions
      .map((q, i) => ({
        ...q,
        revision: rows[i].revision,
        createdBy: rows[i].createdBy,
      }))
      .sort((a, b) => a.order - b.order);
    this.version = snapshot.revision;
    return this.questions;
  }
  async refresh() {
    const sequence = ++this.requestSequence;
    const snapshot = await this.rpc("read_question_bank");
    if (sequence === this.requestSequence) this.accept(snapshot);
    return this.questions;
  }
  /** @param {string} action @param {unknown} payload @param {string | null} [expected] */
  async mutate(action, payload, expected = null) {
    ++this.requestSequence;
    const snapshot = await this.rpc("mutate_questions", {
      action,
      payload,
      expected,
    });
    ++this.requestSequence; // Late poll responses may never replace a successful mutation.
    return this.accept(snapshot);
  }
  /** @param {Question} question */
  async save(question) {
    const errors = validateQuestion(question);
    if (errors.length) throw new Error(errors.join(" "));
    return this.mutate(
      question.revision ? "update" : "create",
      question,
      question.revision || null,
    );
  }
  /** @param {string} id @param {string} [expectedRevision] */
  delete(id, expectedRevision) {
    const question = this.questions.find((q) => q.id === id);
    if (!question)
      throw new Error(
        "This question no longer exists. Refresh your question bank.",
      );
    return this.mutate("delete", { id }, expectedRevision || question.revision);
  }
  /** @param {string} id @param {Question} [draft] */
  duplicate(id, draft) {
    const source = this.questions.find((q) => q.id === id);
    if (!source) throw new Error("This question no longer exists.");
    const copy = draft || duplicateQuestion(source);
    const errors = validateQuestion(copy);
    if (errors.length) throw new Error(errors.join(" "));
    return this.mutate(
      "duplicate",
      { sourceId: id, question: copy },
      this.version,
    );
  }
  /** @param {string} id @param {number} direction @param {import('../models').StudyMode | 'general'} [mode] */
  async move(id, direction, mode = "mixed") {
    const bank = [...this.questions];
    const subset = questionsForMode(bank, mode);
    const neighbor = subset[subset.findIndex((q) => q.id === id) + direction];
    const i = bank.findIndex((q) => q.id === id),
      j = bank.findIndex((q) => q.id === neighbor?.id);
    if (i < 0 || j < 0) return bank;
    [bank[i], bank[j]] = [bank[j], bank[i]];
    return this.mutate(
      "reorder",
      bank.map((q) => q.id),
      this.version,
    );
  }
  /** @param {Question[]} questions @param {'append' | 'replace'} mode @param {string} [expectedVersion] */
  import(questions, mode, expectedVersion = this.version) {
    const copies = parseBank(JSON.stringify(questions)).map((q) => ({
      ...q,
      id: newId(),
      answers: q.answers.map((a) => ({ ...a, id: newId() })),
    }));
    return this.mutate(
      mode,
      copies,
      mode === "replace" ? expectedVersion : null,
    );
  }
  /** Legacy migration retains IDs, never overwrites, and is repeat-safe. @param {Question[]} questions */
  migrate(questions) {
    return this.mutate("migrate", parseBank(JSON.stringify(questions)));
  }
  export() {
    return JSON.stringify(
      {
        version: 1,
        exportedAt: new Date().toISOString(),
        questions: parseBank(JSON.stringify(this.questions)),
      },
      null,
      2,
    );
  }
}
