import { escape, icon } from "./dom.js";
/** @typedef {import('../models').Question} Question */
/** @typedef {import('../models').Attempt} Attempt */

/** Shared renderer for study and isolated previews. @param {HTMLElement} root @param {Question} question @param {Attempt | undefined} attempt @param {(answerId: string) => void} select @param {() => void} toggle */
export function renderQuestion(root, question, attempt, select, toggle) {
  const correct = question.answers.find((a) => a.isCorrect);
  const answered = !!attempt;
  const isCorrect = attempt?.answerId === correct?.id;
  root.innerHTML = `<div class="question-heading"><div class="eyebrow">CHOOSE ONE ANSWER</div><h2>${escape(question.question)}</h2><p>Select the answer you think is right. Every attempt is a step forward.</p></div>
    <div class="answers">${question.answers
      .map((a, i) => {
        const selected = attempt?.answerId === a.id;
        const state =
          answered && a.isCorrect
            ? "correct"
            : selected
              ? "incorrect"
              : "neutral";
        const status =
          state === "correct"
            ? selected
              ? "Correct · Your answer"
              : "Correct answer"
            : state === "incorrect"
              ? "Incorrect · Your answer"
              : "";
        return `<button class="answer ${state}" data-answer="${escape(a.id)}" aria-pressed="${selected}" aria-disabled="${answered}"><span class="answer-letter">${state === "correct" ? icon("check") : state === "incorrect" ? icon("close") : i < 26 ? String.fromCharCode(65 + i) : i + 1}</span><span class="answer-content"><span>${escape(a.text)}</span><span class="answer-status">${status || "&nbsp;"}</span></span></button>`;
      })
      .join("")}</div>
    <div class="answer-feedback" role="status">${answered ? `${icon(isCorrect ? "check" : "bulb")} ${isCorrect ? "That’s right. Nicely done!" : "Not quite. The correct answer is highlighted above."}` : "Take your time. You’ve got this."}</div>
    <div class="explain-actions"><button class="button secondary explain-toggle" ${answered ? "" : "disabled"} aria-expanded="${!!attempt?.explanationOpen}" aria-controls="explanation-panel">${icon("bulb")} Correct Answer Explained ${icon(attempt?.explanationOpen ? "up" : "down")}</button></div>
    <section id="explanation-panel" class="explanation ${attempt?.explanationOpen ? "open" : ""}" ${attempt?.explanationOpen ? "" : "hidden"}><span class="explanation-icon">${icon("bulb")}</span><div><h3>Here’s why this answer is correct</h3><p>${escape(question.explanation)}</p></div></section>`;
  root.querySelectorAll("button[data-answer]").forEach((button) =>
    button.addEventListener("click", () => {
      if (!attempt)
        select(/** @type {HTMLElement} */ (button).dataset.answer || "");
    }),
  );
  root.querySelector(".explain-toggle")?.addEventListener("click", toggle);
}
