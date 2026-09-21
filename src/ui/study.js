import { escape, icon, el } from "./dom.js";
import { renderQuestion } from "./question-card.js";
import { LEVEL_LABELS } from "../data/difficulty.js";
import { SessionOrder } from "../data/session-order.js";
import { routeHref } from "../routing.js";
/** @typedef {import('../models').Question} Question */
/** @typedef {import('../models').Attempt} Attempt */

export class StudySession {
  /** @param {import('../models').StudyMode} [mode] */
  constructor(mode = "mixed") {
    this.mode = mode;
    /** @type {Map<string, Attempt>} */ this.attempts = new Map();
    this.index = 0;
    this.finished = false;
    this.order = new SessionOrder();
  }
  /** @param {HTMLElement} root @param {Question[]} questions */
  render(root, questions) {
    if (this.mode === "mixed") {
      const currentId = this.order.ids[this.index];
      questions = this.order.resolve(questions);
      const currentIndex = questions.findIndex((q) => q.id === currentId);
      if (currentIndex >= 0) this.index = currentIndex;
    }
    for (const [id, attempt] of this.attempts)
      if (
        !questions.some((q) => q.id === id && q.updatedAt === attempt.revision)
      )
        this.attempts.delete(id);
    if (!questions.length) {
      this.index = 0;
      this.finished = false;
      root.innerHTML =
        this.mode === "mixed"
          ? `<div class="empty"><span class="empty-icon">${icon("book")}</span><h1>A little preparation.<br>A lot of possibility.</h1><p>No multiple-choice questions are available yet.</p><a class="button primary" href="${routeHref("/multiple-choice/manage")}">Manage Questions ${icon("next")}</a></div>`
          : `<div class="empty"><span class="empty-icon">${icon("book")}</span><h1>No ${LEVEL_LABELS[this.mode]} Questions Yet</h1><p>Add ${LEVEL_LABELS[this.mode].toLowerCase()} questions to start building this practice set.</p><button class="button primary" id="add-level-question">${icon("plus")} Add ${LEVEL_LABELS[this.mode]} Question</button></div>`;
      return;
    }
    this.index = Math.min(this.index, questions.length - 1);
    if (this.finished && this.attempts.size !== questions.length) {
      this.finished = false;
      // A level may gain questions, or an earlier answer may be invalidated by an edit.
      this.index = questions.findIndex((q) => !this.attempts.has(q.id));
    }
    if (this.finished) {
      const correct = questions.filter((q) =>
        q.answers.some(
          (a) => a.isCorrect && a.id === this.attempts.get(q.id)?.answerId,
        ),
      ).length;
      root.innerHTML = `<div class="completion"><span class="completion-icon">${icon("check")}</span><div class="eyebrow">SESSION COMPLETE</div><h1>A little more confident.<br>A little further ahead.</h1><p>You’ve worked through every question. Keep building on what you know.</p><div class="score"><strong>${correct}<span> / ${questions.length}</span></strong><span>answered correctly</span></div><div class="button-row"><button class="button primary" id="restart">Start a fresh session ${icon("next")}</button><button class="button secondary" id="review">Review answers</button></div></div>`;
      el("#restart", root).onclick = () => {
        this.attempts.clear();
        this.order.reset();
        this.index = 0;
        this.finished = false;
        this.render(root, questions);
      };
      el("#review", root).onclick = () => {
        this.index = 0;
        this.finished = false;
        this.render(root, questions);
      };
      return;
    }
    const question = questions[this.index];
    const attempt = this.attempts.get(question.id);
    root.innerHTML = `<section class="study-intro"><div><div class="eyebrow">YOUR SPACE TO GROW</div><h1>Small steps. Stronger understanding.</h1><p>Make a choice, discover the why, and keep moving forward.</p></div><span class="session-badge">${icon("book")} Practice session</span></section>
      <section class="study-card" aria-label="Multiple-choice practice"><div class="study-meta"><div class="button-row"><span class="topic">${escape(question.category || "General knowledge")}</span><span class="difficulty">${LEVEL_LABELS[question.difficulty]}</span></div><span class="question-number">Question <strong>${this.index + 1}</strong> of ${questions.length}</span></div><div class="progress-track" role="progressbar" aria-label="Questions answered" aria-valuemin="0" aria-valuemax="${questions.length}" aria-valuenow="${this.attempts.size}"><span style="width:${(this.attempts.size / questions.length) * 100}%"></span></div><div class="question-body"></div><footer class="question-navigation"><button id="previous" class="button ghost" ${this.index === 0 ? "disabled" : ""}>${icon("previous")} Previous</button><span class="page-count" aria-label="Question progress">${this.index + 1} / ${questions.length}</span><button id="next" class="button primary" ${attempt ? "" : "disabled"}>${this.index === questions.length - 1 ? "Finish" : "Next"} ${icon("next")}</button></footer></section><p class="study-footnote">${icon("shield")} A space to practise, not to be perfect.</p>`;
    const render = (/** @type {string | undefined} */ focus) => {
      this.render(root, questions);
      if (focus)
        root.querySelector(focus)?.scrollIntoView({ block: "nearest" });
      if (focus)
        /** @type {HTMLElement | null} */ (root.querySelector(focus))?.focus({
          preventScroll: true,
        });
    };
    renderQuestion(
      el(".question-body", root),
      question,
      attempt,
      (id) => {
        this.attempts.set(question.id, {
          answerId: id,
          explanationOpen: false,
          revision: question.updatedAt,
        });
        render(`[data-answer="${CSS.escape(id)}"]`);
      },
      () => {
        if (attempt) attempt.explanationOpen = !attempt.explanationOpen;
        render(".explain-toggle");
      },
    );
    el("#previous", root).onclick = () => {
      this.index--;
      render("#next");
    };
    el("#next", root).onclick = () => {
      if (!attempt) return;
      if (this.index === questions.length - 1) this.finished = true;
      else this.index++;
      render(undefined);
      const title = root.querySelector("h2, h1");
      if (title instanceof HTMLElement) {
        title.tabIndex = -1;
        title.focus();
      }
    };
  }
}
