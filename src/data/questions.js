/** @typedef {import('../models').Question} Question */
export const newId = () => crypto.randomUUID();

/** @param {Question['difficulty']} [difficulty] @returns {Question} */
export function emptyQuestion(difficulty = "general") {
  const now = new Date().toISOString();
  return {
    id: newId(),
    question: "",
    answers: Array.from({ length: 4 }, () => ({
      id: newId(),
      text: "",
      isCorrect: false,
    })),
    explanation: "",
    category: "",
    difficulty,
    tags: [],
    order: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/** The seed goes through the same validation and storage as authored questions. @returns {Question[]} */
export function defaultQuestions() {
  const q = emptyQuestion("medium");
  q.question = "What is the central concern of imbalanced learning?";
  q.category = "Machine learning";
  q.tags = ["Class imbalance", "Fundamentals"];
  q.answers = [
    "Replacing supervised learning with completely unlabeled data analysis",
    "Learning effectively when classes are severely underrepresented or unevenly distributed",
    "Reducing the number of features before applying any classification algorithm",
    "Learning only when every class contains exactly the same number of examples",
  ].map((text, i) => ({ id: newId(), text, isCorrect: i === 1 }));
  q.explanation =
    "Imbalanced learning addresses the performance of learning algorithms when data contain underrepresented classes and severe class-distribution skews.";
  return [q];
}

/** A draft only: duplication is persisted after the editor's Save action.
 * @param {Question} question @returns {Question}
 */
export function duplicateQuestion(question) {
  const now = new Date().toISOString();
  return {
    ...structuredClone(question),
    revision: undefined,
    createdBy: undefined,
    id: newId(),
    question: `${question.question} (copy)`,
    answers: question.answers.map((a) => ({ ...a, id: newId() })),
    createdAt: now,
    updatedAt: now,
  };
}
