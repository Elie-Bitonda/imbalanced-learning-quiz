import { routeHref } from "../routing.js";
/** @typedef {import('../models').Difficulty} Difficulty */
/** @typedef {import('../models').StudyMode} StudyMode */
/** @type {Difficulty[]} */
export const DIFFICULTIES = ["beginner", "medium", "pro", "general"];
/** @type {StudyMode[]} */
export const STUDY_MODES = ["mixed", "beginner", "medium", "pro"];
/** @type {Record<StudyMode | 'general', string>} */
export const LEVEL_LABELS = {
  mixed: "Mixed",
  beginner: "Beginner",
  medium: "Medium",
  pro: "Pro",
  general: "General",
};
/** @type {Record<StudyMode, string>} */
export const MODE_DESCRIPTIONS = {
  mixed: "Questions from all difficulty levels",
  beginner: "Start with foundational questions",
  medium: "Practice intermediate concepts",
  pro: "Challenge yourself with advanced questions",
};

/** Read-time compatibility: never guesses a level for unassigned questions.
 * @param {unknown} value @returns {Difficulty | undefined}
 */
export function normalizeDifficulty(value) {
  if (value === undefined || value === null || value === "") return "general";
  if (typeof value !== "string") return undefined;
  switch (value.trim().toLowerCase()) {
    case "easy":
    case "beginner":
      return "beginner";
    case "medium":
      return "medium";
    case "hard":
    case "pro":
      return "pro";
    case "general":
    case "":
      return "general";
    default:
      return undefined;
  }
}

/** Every mode derives from the same records; no copies or writes.
 * @param {import('../models').Question[]} questions
 * @param {StudyMode | 'general'} mode
 */
export function questionsForMode(questions, mode) {
  return mode === "mixed"
    ? questions
    : questions.filter((q) => q.difficulty === mode);
}

/** @param {string | null} value @param {boolean} [manage] @returns {StudyMode | 'general'} */
export function modeFromQuery(value, manage = false) {
  return [...STUDY_MODES, ...(manage ? ["general"] : [])].includes(value || "")
    ? /** @type {StudyMode | 'general'} */ (value)
    : "mixed";
}

/** @param {StudyMode | 'general'} mode @param {boolean} [manage] */
export function levelUrl(mode, manage = false) {
  return routeHref(
    `/multiple-choice${manage ? "/manage" : ""}${mode === "mixed" ? "" : `?level=${mode}`}`,
  );
}
