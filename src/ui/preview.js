import { modal, el } from "./dom.js";
import { renderQuestion } from "./question-card.js";
/** @param {import('../models').Question} question */
export function previewQuestion(question) {
  const { dialog, close } = modal(
    "Question preview",
    '<p class="preview-note">Try the question as a learner. Preview answers do not affect your study session.</p><div class="preview-question"></div><footer class="modal-footer"><button class="button primary" id="done-preview">Back</button></footer>',
    "preview-modal",
  );
  /** @type {import('../models').Attempt | undefined} */ let attempt;
  const render = () =>
    renderQuestion(
      el(".preview-question", dialog),
      question,
      attempt,
      (id) => {
        attempt = {
          answerId: id,
          explanationOpen: false,
          revision: question.updatedAt,
        };
        render();
        el(".explain-toggle", dialog).focus();
      },
      () => {
        if (attempt) attempt.explanationOpen = !attempt.explanationOpen;
        render();
        el(".explain-toggle", dialog).focus();
      },
    );
  render();
  el("#done-preview", dialog).onclick = close;
}
