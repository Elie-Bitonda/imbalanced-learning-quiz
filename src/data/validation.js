import { normalizeDifficulty } from "./difficulty.js";
/** @typedef {import('../models').Question} Question */
/** @param {unknown} value @returns {value is Record<string, unknown>} */
const record = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);
/** @param {unknown} value */
const nonempty = (value) =>
  typeof value === "string" && value.trim().length > 0;

/** @param {unknown} value @returns {string[]} */
export function validateQuestion(value) {
  if (!record(value)) return ["Question must be an object."];
  const errors = [];
  if (!nonempty(value.id)) errors.push("Question must have a unique ID.");
  if (!nonempty(value.question)) errors.push("Write a question.");
  if (!nonempty(value.explanation))
    errors.push("Add an explanation of the correct answer.");
  if (!Array.isArray(value.answers) || value.answers.length < 2)
    errors.push("Add at least two answers.");
  if (Array.isArray(value.answers)) {
    const ids = new Set();
    let correct = 0;
    value.answers.forEach((answer, i) => {
      if (!record(answer)) {
        errors.push(`Answer ${i + 1} is invalid.`);
        return;
      }
      if (!nonempty(answer.text))
        errors.push(`Write text for answer ${i + 1}.`);
      if (!nonempty(answer.id) || ids.has(answer.id))
        errors.push(`Answer ${i + 1} needs a unique ID.`);
      ids.add(answer.id);
      if (typeof answer.isCorrect !== "boolean")
        errors.push(`Answer ${i + 1} must specify whether it is correct.`);
      if (answer.isCorrect === true) correct++;
    });
    if (correct !== 1) errors.push("Select exactly one correct answer.");
  }
  if (typeof value.category !== "string") errors.push("Category must be text.");
  if (!normalizeDifficulty(value.difficulty))
    errors.push("Choose Beginner, Medium, Pro, or General difficulty.");
  if (
    !Array.isArray(value.tags) ||
    value.tags.some((tag) => typeof tag !== "string")
  )
    errors.push("Tags must be a list of text values.");
  if (!Number.isInteger(value.order) || Number(value.order) < 0)
    errors.push("Question order must be a non-negative integer.");
  for (const field of ["createdAt", "updatedAt"])
    if (
      typeof value[field] !== "string" ||
      !Number.isFinite(Date.parse(String(value[field])))
    )
      errors.push(`${field} must be a valid date.`);
  return errors;
}

/** Validates the entire bank before any mutation. @param {string} json @returns {Question[]} */
export function parseBank(json) {
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error(
      "This file is not valid JSON. Choose a question-bank JSON export.",
    );
  }
  const rows = Array.isArray(data)
    ? data
    : record(data) && data.version === 1
      ? data.questions
      : null;
  if (!Array.isArray(rows))
    throw new Error(
      "Expected a question array or a version 1 question-bank export.",
    );
  if (rows.length > 10000)
    throw new Error("Import up to 10,000 questions at a time.");
  for (const [i, row] of rows.entries()) {
    const errors = validateQuestion(row);
    if (errors.length)
      throw new Error(`Question ${i + 1}: ${errors.join(" ")}`);
  }
  return rows.map((row) => ({
    id: row.id,
    question: row.question.trim(),
    answers: row.answers.map((/** @type {import('../models').Answer} */ a) => ({
      id: a.id,
      text: a.text.trim(),
      isCorrect: a.isCorrect,
    })),
    explanation: row.explanation.trim(),
    category: row.category.trim(),
    difficulty: /** @type {Question['difficulty']} */ (
      normalizeDifficulty(row.difficulty)
    ),
    tags: [...row.tags],
    order: row.order,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}
