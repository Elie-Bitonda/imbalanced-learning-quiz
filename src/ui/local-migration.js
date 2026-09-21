import { STORAGE_KEY } from "../data/repository.js";
import { parseBank } from "../data/validation.js";
import { el, modal, download, notify, message } from "./dom.js";

/** Available even when Supabase is unconfigured: never removes or seeds local data. */
export function backupLocalBank() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      notify("No earlier question bank was found in this browser.");
      return;
    }
    download("forma-local-backup.json", raw);
  } catch (error) {
    notify(message(error));
  }
}

/** @param {import('../data/shared-repository').SharedQuestionRepository} repository @param {() => void} refresh */
export function openLocalMigration(repository, refresh) {
  const { dialog, close } = modal(
    "Migrate existing questions",
    '<div class="import-content"><p>Choose a JSON backup from the earlier local app. IDs are preserved. Existing shared IDs are skipped, never overwritten. The original browser data and backup remain unchanged.</p><button class="button secondary" id="read-local">Read this browser’s old bank</button><label class="field">Or choose a local-bank backup<input id="migration-file" type="file" accept=".json,application/json" /></label><p id="migration-count" role="status"></p><p class="form-errors" role="alert" hidden></p></div><footer class="modal-footer"><button class="button primary" id="migrate" disabled>Migrate questions</button></footer>',
  );
  /** @type {import('../models').Question[] | undefined} */ let questions;
  const submit = /** @type {HTMLButtonElement} */ (el("#migrate", dialog));
  const errorBox = el('[role="alert"]', dialog);
  /** @param {string} raw */
  const parse = (raw) => {
    questions = undefined;
    submit.disabled = true;
    errorBox.hidden = true;
    try {
      const incoming = parseBank(raw);
      if (new Set(incoming.map((q) => q.id)).size !== incoming.length)
        throw new Error(
          "This backup contains duplicate question IDs. Repair them before migration.",
        );
      questions = incoming;
      const matches = incoming.filter((q) =>
        repository.list().some((existing) => existing.id === q.id),
      ).length;
      el("#migration-count", dialog).textContent =
        `${incoming.length} questions validated; ${matches} existing IDs will be skipped. Back up your local bank before continuing.`;
      submit.disabled = incoming.length === 0;
    } catch (error) {
      errorBox.hidden = false;
      errorBox.textContent = message(error);
    }
  };
  el("#read-local", dialog).onclick = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null)
        throw new Error(
          "No local bank here. Open the old local app and download its backup, then choose that file.",
        );
      parse(raw);
    } catch (error) {
      errorBox.hidden = false;
      errorBox.textContent = message(error);
    }
  };
  el("#migration-file", dialog).onchange = async (event) => {
    const file = /** @type {HTMLInputElement} */ (event.target).files?.[0];
    questions = undefined;
    submit.disabled = true;
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024)
        throw new Error("Choose a backup smaller than 5 MB.");
      parse(await file.text());
    } catch (error) {
      errorBox.hidden = false;
      errorBox.textContent = message(error);
    }
  };
  submit.onclick = async () => {
    if (!questions) return;
    dialog.inert = true;
    dialog.setAttribute("aria-busy", "true");
    try {
      await repository.migrate(questions);
      refresh();
      close();
      notify("Migration complete. Your original local bank is still intact.");
    } catch (error) {
      errorBox.hidden = false;
      errorBox.textContent = message(error);
    } finally {
      dialog.inert = false;
      dialog.removeAttribute("aria-busy");
    }
  };
}
