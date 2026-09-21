import { defaultQuestions, duplicateQuestion, newId } from "./questions.js";
import { normalizeDifficulty, questionsForMode } from "./difficulty.js";
import { parseBank, validateQuestion } from "./validation.js";
/** @typedef {import('../models').Question} Question */
export const STORAGE_KEY = "forma.multiple-choice.questions.v1";

/** UI-facing repository; replace this adapter with an API-backed implementation later. */
export class QuestionRepository {
  /** @param {import('../models').StorageAdapter} storage */
  constructor(storage) {
    this.storage = storage;
  }
  /** @returns {Question[]} */
  list() {
    const raw = this.storage.getItem(STORAGE_KEY);
    if (raw === null) return this.commit(defaultQuestions());
    const questions = parseBank(raw);
    if (new Set(questions.map((q) => q.id)).size !== questions.length)
      throw new Error(
        "Stored question IDs are duplicated. Export the stored data and repair it before continuing.",
      );
    return questions.sort((a, b) => a.order - b.order);
  }
  /** @param {Question[]} questions */
  commit(questions) {
    const ordered = questions.map((q, order) => ({
      ...q,
      order,
      difficulty: /** @type {Question['difficulty']} */ (
        normalizeDifficulty(q.difficulty) ?? q.difficulty
      ),
    }));
    for (const q of ordered) {
      const errors = validateQuestion(q);
      if (errors.length) throw new Error(errors.join(" "));
    }
    try {
      this.storage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: 1, questions: ordered }),
      );
    } catch {
      throw new Error(
        "Your changes could not be saved. Browser storage may be full or blocked. Export a backup and try again.",
      );
    }
    return ordered;
  }
  /** @param {Question} question */
  save(question) {
    const bank = this.list();
    const index = bank.findIndex((q) => q.id === question.id);
    const saved = { ...question, updatedAt: new Date().toISOString() };
    if (index < 0) bank.push(saved);
    else bank[index] = saved;
    return this.commit(bank);
  }
  /** @param {string} id */
  delete(id) {
    return this.commit(this.list().filter((q) => q.id !== id));
  }
  /** @param {string} id @param {Question} [draft] */
  duplicate(id, draft) {
    const bank = this.list();
    const index = bank.findIndex((q) => q.id === id);
    if (index < 0) throw new Error("This question no longer exists.");
    const copy = draft || duplicateQuestion(bank[index]);
    if (bank.some((q) => q.id === copy.id))
      throw new Error("A duplicate needs its own unique ID.");
    bank.splice(index + 1, 0, copy);
    return this.commit(bank);
  }
  /** @param {string} id @param {number} direction @param {import('../models').StudyMode | 'general'} [mode] */
  move(id, direction, mode = "mixed") {
    const bank = this.list();
    const subset = questionsForMode(bank, mode);
    const neighbor = subset[subset.findIndex((q) => q.id === id) + direction];
    const i = bank.findIndex((q) => q.id === id);
    const j = bank.findIndex((q) => q.id === neighbor?.id);
    if (i >= 0 && j >= 0 && j < bank.length)
      [bank[i], bank[j]] = [bank[j], bank[i]];
    return this.commit(bank);
  }
  /** Imports always receive fresh IDs, preventing clashes with questions and session attempts. @param {Question[]} incoming @param {'append'|'replace'} mode */
  import(incoming, mode) {
    const validated = parseBank(JSON.stringify(incoming));
    const copies = validated.map((q) => ({
      ...q,
      id: newId(),
      answers: q.answers.map((a) => ({ ...a, id: newId() })),
    }));
    return this.commit([...(mode === "append" ? this.list() : []), ...copies]);
  }
  export() {
    return JSON.stringify(
      {
        version: 1,
        exportedAt: new Date().toISOString(),
        questions: this.list(),
      },
      null,
      2,
    );
  }
}
