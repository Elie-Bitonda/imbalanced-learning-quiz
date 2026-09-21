import { emptyQuestion, newId } from "../data/questions.js";
import { validateQuestion } from "../data/validation.js";
import { escape, icon, modal, el, message } from "./dom.js";
import { DIFFICULTIES, LEVEL_LABELS } from "../data/difficulty.js";
import { previewQuestion } from "./preview.js";
/** @typedef {import('../models').Question} Question */

/** @param {Question | undefined} original @param {(question: Question) => unknown | Promise<unknown>} save @param {{ difficulty?: Question["difficulty"], title?: string }} [options] */
export function openEditor(original, save, options = {}) {
  const draft = original
    ? structuredClone(original)
    : emptyQuestion(options.difficulty);
  let dirty = false;
  let saving = false;
  const { dialog, close } = modal(
    options.title || (original ? "Edit question" : "Add a question"),
    `<form novalidate><div class="editor-content"><p class="editor-intro">Create a moment of understanding. Give every answer a clear explanation.</p><div class="form-errors" role="alert" tabindex="-1" hidden></div><div class="field"><label for="question-text">Question</label> <span class="required">Required</span><textarea id="question-text" name="question" rows="3" placeholder="What would you like to ask?" required>${escape(draft.question)}</textarea></div><fieldset><legend>Answer options <span class="required">Select one correct answer</span></legend><div id="answer-editor"></div><button type="button" class="button text-button" id="add-answer">${icon("plus")} Add another answer</button></fieldset><div class="field"><label for="explanation-text">Correct answer explanation</label> <span class="required">Required</span><textarea id="explanation-text" name="explanation" rows="4" placeholder="Explain why this answer is correct…" required>${escape(draft.explanation)}</textarea></div><div class="metadata-fields"><label class="field">Category <span class="optional">Optional</span><input name="category" value="${escape(draft.category)}" placeholder="e.g. Machine learning" /></label><label class="field">Difficulty Level<select name="difficulty">${DIFFICULTIES.map((d) => `<option value="${d}" ${draft.difficulty === d ? "selected" : ""}>${LEVEL_LABELS[d]}</option>`).join("")}</select></label></div><label class="field">Tags <span class="optional">Optional · comma separated</span><input name="tags" value="${escape(draft.tags.join(", "))}" placeholder="e.g. Fundamentals, Classification" /></label></div><footer class="modal-footer"><button type="button" class="button ghost" id="cancel-editor">Cancel</button><span class="footer-spacer"></span><button type="button" class="button secondary" id="preview-editor">Preview</button><button type="submit" class="button primary">Save question ${icon("check")}</button></footer></form>`,
    "editor-modal",
  );
  const form = /** @type {HTMLFormElement} */ (el("form", dialog));
  form.addEventListener("input", () => {
    dirty = true;
  });
  const sync = () => {
    const data = new FormData(form);
    draft.question = String(data.get("question") || "").trim();
    draft.explanation = String(data.get("explanation") || "").trim();
    draft.category = String(data.get("category") || "").trim();
    draft.difficulty = /** @type {Question['difficulty']} */ (
      data.get("difficulty")
    );
    draft.tags = [
      ...new Set(
        String(data.get("tags") || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ];
    for (const a of draft.answers) {
      a.text = String(data.get(`answer-${a.id}`) || "").trim();
      a.isCorrect = data.get("correct") === a.id;
    }
  };
  const renderAnswers = () => {
    el("#answer-editor", dialog).innerHTML = draft.answers
      .map(
        (a, i) =>
          `<div class="answer-editor-row"><label class="correct-radio" title="Mark answer ${i + 1} correct"><input type="radio" name="correct" value="${escape(a.id)}" ${a.isCorrect ? "checked" : ""} aria-label="Mark answer ${i + 1} correct"/><span>${i < 26 ? String.fromCharCode(65 + i) : i + 1}</span></label><label class="answer-input"><span class="sr-only">Answer ${i + 1}</span><textarea rows="2" name="answer-${escape(a.id)}" placeholder="Answer option ${i + 1}" required>${escape(a.text)}</textarea></label><div class="answer-row-actions"><button type="button" class="icon-button" data-move="${i}" data-direction="-1" aria-label="Move answer ${i + 1} up" ${i === 0 ? "disabled" : ""}>${icon("up")}</button><button type="button" class="icon-button" data-move="${i}" data-direction="1" aria-label="Move answer ${i + 1} down" ${i === draft.answers.length - 1 ? "disabled" : ""}>${icon("down")}</button><button type="button" class="icon-button danger-text" data-remove="${i}" aria-label="Remove answer ${i + 1}" ${draft.answers.length <= 2 ? "disabled" : ""}>${icon("trash")}</button></div></div>`,
      )
      .join("");
    dialog.querySelectorAll("[data-move]").forEach((button) =>
      button.addEventListener("click", () => {
        sync();
        dirty = true;
        const b = /** @type {HTMLElement} */ (button);
        const i = Number(b.dataset.move),
          j = i + Number(b.dataset.direction);
        [draft.answers[i], draft.answers[j]] = [
          draft.answers[j],
          draft.answers[i],
        ];
        renderAnswers();
        el(`[name="answer-${draft.answers[j].id}"]`, dialog).focus();
      }),
    );
    dialog.querySelectorAll("[data-remove]").forEach((button) =>
      button.addEventListener("click", () => {
        sync();
        dirty = true;
        draft.answers.splice(
          Number(/** @type {HTMLElement} */ (button).dataset.remove),
          1,
        );
        renderAnswers();
        el("#add-answer", dialog).focus();
      }),
    );
  };
  renderAnswers();
  el("#add-answer", dialog).onclick = () => {
    sync();
    dirty = true;
    const answer = { id: newId(), text: "", isCorrect: false };
    draft.answers.push(answer);
    renderAnswers();
    el(`[name="answer-${answer.id}"]`, dialog).focus();
  };
  /** @param {string[]} errors */
  const showErrors = (errors) => {
    const box = el(".form-errors", dialog);
    box.hidden = !errors.length;
    box.innerHTML = `<strong>Let’s check a few things</strong><ul>${errors.map((e) => `<li>${escape(e)}</li>`).join("")}</ul>`;
    if (errors.length) box.focus();
  };
  const valid = () => {
    sync();
    const errors = validateQuestion(draft);
    showErrors(errors);
    return errors.length === 0;
  };
  el("#preview-editor", dialog).onclick = () => {
    if (valid()) previewQuestion(draft);
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (saving || !valid()) return;
    saving = true;
    form.inert = true;
    form.setAttribute("aria-busy", "true");
    try {
      await save(draft);
      close();
    } catch (error) {
      form.inert = false;
      showErrors([message(error)]);
    } finally {
      saving = false;
      form.inert = false;
      form.removeAttribute("aria-busy");
    }
  };
  const requestClose = () => {
    if (saving) return;
    if (!dirty) {
      close();
      return;
    }
    const confirm = modal(
      "Discard unsaved changes?",
      '<div class="confirm-content"><p>Your changes haven’t been saved. Keep editing to finish your question.</p></div><footer class="modal-footer"><button id="keep-editing" class="button secondary">Keep editing</button><button id="discard" class="button danger">Discard changes</button></footer>',
    );
    el("#keep-editing", confirm.dialog).onclick = confirm.close;
    el("#discard", confirm.dialog).onclick = () => {
      confirm.close();
      close();
    };
  };
  el("#cancel-editor", dialog).onclick = requestClose;
  el("[data-close]", dialog).onclick = requestClose;
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    requestClose();
  });
}
