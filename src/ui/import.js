import { parseBank } from "../data/validation.js";
import { modal, el, escape, message } from "./dom.js";
/** @param {import('../models').QuestionStore} repository @param {() => void} refresh */
export function openImport(repository, refresh) {
  const expectedVersion = repository.version;
  const { dialog, close } = modal(
    "Import question bank",
    `<div class="import-content"><p>Bring your questions with you. Choose a JSON question-bank export (up to 5 MB).</p><label class="field">Question bank file<input type="file" id="import-file" accept=".json,application/json" /></label><div id="import-status" role="status"></div><fieldset><legend>How should we import?</legend><label class="import-option"><input type="radio" name="import-mode" value="append" checked/><span><strong>Add to existing questions</strong><small>Keep your bank and append the imported questions. Copies receive new IDs.</small></span></label><label class="import-option"><input type="radio" name="import-mode" value="replace"/><span><strong>Replace existing questions</strong><small>Remove your current bank and use the imported questions instead. Export a backup first.</small></span></label></fieldset><label class="replace-confirm" hidden><input type="checkbox" id="confirm-replace"/> I understand that my current question bank will be replaced.</label><p class="form-errors" id="import-error" role="alert" hidden></p></div><footer class="modal-footer"><button class="button secondary" id="cancel-import">Cancel</button><button class="button primary" id="confirm-import" disabled>Import questions</button></footer>`,
  );
  /** @type {import('../models').Question[] | undefined} */ let incoming;
  const file = /** @type {HTMLInputElement} */ (el("#import-file", dialog));
  const submit = /** @type {HTMLButtonElement} */ (
    el("#confirm-import", dialog)
  );
  const replacement = /** @type {HTMLInputElement} */ (
    el("#confirm-replace", dialog)
  );
  const mode = () =>
    /** @type {HTMLInputElement} */ (el('[name="import-mode"]:checked', dialog))
      .value;
  const update = () => {
    el(".replace-confirm", dialog).hidden = mode() !== "replace";
    submit.disabled =
      !incoming || (mode() === "replace" && !replacement.checked);
  };
  file.onchange = async () => {
    incoming = undefined;
    update();
    el("#import-error", dialog).hidden = true;
    el("#import-status", dialog).textContent = "";
    const selected = file.files?.[0];
    if (!selected) return;
    try {
      if (selected.size > 5 * 1024 * 1024)
        throw new Error("Choose a JSON file smaller than 5 MB.");
      const text = await selected.text();
      if (file.files?.[0] !== selected) return;
      incoming = parseBank(text).sort((a, b) => a.order - b.order);
      el("#import-status", dialog).innerHTML =
        `<div class="import-ready"><strong>${incoming.length} ${incoming.length === 1 ? "question" : "questions"} ready to import</strong><span>All questions passed validation.</span></div>`;
    } catch (error) {
      el("#import-error", dialog).textContent = message(error);
      el("#import-error", dialog).hidden = false;
    }
    update();
  };
  dialog
    .querySelectorAll('input[type="radio"], input[type="checkbox"]')
    .forEach((input) => input.addEventListener("change", update));
  el("#cancel-import", dialog).onclick = close;
  submit.onclick = async () => {
    if (!incoming || submit.disabled) return;
    dialog.inert = true;
    dialog.setAttribute("aria-busy", "true");
    try {
      await repository.import(
        incoming,
        mode() === "replace" ? "replace" : "append",
        expectedVersion,
      );
      refresh();
      close();
    } catch (error) {
      el("#import-error", dialog).innerHTML = escape(message(error));
      el("#import-error", dialog).hidden = false;
    } finally {
      dialog.inert = false;
      dialog.removeAttribute("aria-busy");
    }
  };
}
