import { escape, icon, el, modal, notify, message, download } from "./dom.js";
import { openEditor } from "./editor.js";
import { previewQuestion } from "./preview.js";
import { openImport } from "./import.js";
import { questionsForMode, LEVEL_LABELS } from "../data/difficulty.js";
import { duplicateQuestion } from "../data/questions.js";
import { managerLevelSelector } from "./level-selector.js";
/** @typedef {import('../models').Question} Question */

export class QuestionManager {
  /** @param {import('../models').QuestionStore} repository @param {(() => void) | undefined} [onChange] */
  constructor(repository, onChange) {
    this.repository = repository;
    this.onChange = onChange;
    this.search = "";
    this.category = "";
    /** @type {import('../models').StudyMode | 'general'} */ this.mode =
      "mixed";
  }
  /** @param {HTMLElement} root @param {import('../models').StudyMode | 'general'} [mode] */
  render(root, mode = this.mode) {
    this.mode = mode;
    const questions = this.repository.list();
    const levelQuestions = questionsForMode(questions, mode);
    const addLabel =
      mode === "mixed" ? "Add Question" : `Add ${LEVEL_LABELS[mode]} Question`;
    const categories = [
      ...new Set(questions.map((q) => q.category).filter(Boolean)),
    ].sort();
    if (!categories.includes(this.category)) this.category = "";
    root.innerHTML = `<section class="manager-heading"><div><div class="eyebrow">BUILD YOUR KNOWLEDGE BANK</div><h1>Multiple Choice Questions</h1><p><strong>${levelQuestions.length} ${levelQuestions.length === 1 ? "question" : "questions"}${mode === "mixed" ? "" : ` · ${LEVEL_LABELS[mode]}`}</strong><span class="dot">·</span>A good question is the start of something great.</p></div><button class="button primary" id="add-question">${icon("plus")} ${addLabel}</button></section>${managerLevelSelector(questions, mode)}<section class="manager-panel"><div class="manager-toolbar"><label class="search-box">${icon("search")}<span class="sr-only">Search questions</span><input id="search" type="search" placeholder="${mode === "mixed" ? "Search questions or tags…" : `Search ${LEVEL_LABELS[mode]} questions…`}" value="${escape(this.search)}"/></label><label class="sr-only" for="category-filter">Filter by category</label><select id="category-filter"><option value="">All categories</option>${categories.map((c) => `<option ${c === this.category ? "selected" : ""} value="${escape(c)}">${escape(c)}</option>`).join("")}</select><div class="bank-actions"><button class="button ghost" id="import">${icon("upload")} Import</button><button class="button ghost" id="export">${icon("download")} Export</button></div></div><div id="question-list"></div></section><p class="storage-note">${icon("shield")} Saved in this browser on this device. Export your bank to keep a backup.</p>`;
    const refresh = () => (this.onChange ? this.onChange() : this.render(root));
    /** @param {() => unknown} action @param {string} success */
    const act = async (action, success) => {
      root.inert = true;
      root.setAttribute("aria-busy", "true");
      try {
        await action();
        refresh();
        notify(success);
      } catch (error) {
        notify(message(error));
      } finally {
        root.inert = false;
        root.removeAttribute("aria-busy");
      }
    };
    /** @param {Question | undefined} q */
    const edit = (q) =>
      openEditor(
        q,
        async (draft) => {
          await this.repository.save(draft);
          refresh();
          notify("Question saved.");
        },
        { difficulty: mode === "mixed" ? "general" : mode },
      );
    el("#add-question", root).onclick = () => edit(undefined);
    el("#import", root).onclick = () =>
      openImport(this.repository, () => {
        refresh();
        notify("Question bank imported.");
      });
    el("#export", root).onclick = () => {
      try {
        download("forma-question-bank.json", this.repository.export());
        notify("Question bank exported.");
      } catch (error) {
        notify(message(error));
      } finally {
        root.inert = false;
        root.removeAttribute("aria-busy");
      }
    };
    const drawList = () => {
      const query = this.search.trim().toLocaleLowerCase();
      const filtered = levelQuestions.filter(
        (q) =>
          (!this.category || q.category === this.category) &&
          [q.question, q.category, ...q.tags]
            .join(" ")
            .toLocaleLowerCase()
            .includes(query),
      );
      const list = el("#question-list", root);
      list.innerHTML =
        !levelQuestions.length && mode !== "mixed"
          ? `<div class="empty manager-empty"><span class="empty-icon">${icon("grid")}</span><h2>No ${LEVEL_LABELS[mode]} Questions Yet</h2><p>Add ${LEVEL_LABELS[mode].toLowerCase()} questions to start building this practice set.</p><button class="button primary" id="empty-add">${icon("plus")} ${addLabel}</button></div>`
          : !questions.length
            ? `<div class="empty manager-empty"><span class="empty-icon">${icon("grid")}</span><h2>No questions yet</h2><p>Create your first multiple-choice question to get started.</p><button class="button primary" id="empty-add">${icon("plus")} Add Question</button></div>`
            : !filtered.length
              ? '<div class="empty manager-empty"><h2>No matching questions</h2><p>Try another search or choose a different category.</p><button class="button secondary" id="clear-filters">Clear filters</button></div>'
              : `<div class="list-caption"><span>${filtered.length === questions.length ? "YOUR QUESTIONS" : `${filtered.length} MATCHING QUESTIONS`}</span><span>Use arrows to change study order</span></div>${filtered
                  .map((q) => {
                    const i = questions.findIndex((item) => item.id === q.id);
                    const levelIndex = levelQuestions.findIndex(
                      (item) => item.id === q.id,
                    );
                    const correct = q.answers.find((a) => a.isCorrect);
                    return `<article class="question-row" data-id="${escape(q.id)}"><div class="order-controls"><span class="order-number">${String(i + 1).padStart(2, "0")}</span><div><button class="icon-button" data-action="up" aria-label="Move question ${i + 1} up" ${levelIndex === 0 ? "disabled" : ""}>${icon("up")}</button><button class="icon-button" data-action="down" aria-label="Move question ${i + 1} down" ${levelIndex === levelQuestions.length - 1 ? "disabled" : ""}>${icon("down")}</button></div></div><div class="question-summary"><div class="question-labels"><span class="topic">${escape(q.category || "Uncategorized")}</span><span>${LEVEL_LABELS[q.difficulty]}</span><span>${q.answers.length} answers</span></div><h2>${escape(q.question)}</h2><p class="correct-summary">${icon("check")}<span><strong>Correct:</strong> ${escape(correct?.text)}</span></p><span class="edited">Edited ${escape(new Date(q.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }))}</span></div><div class="question-actions"><button class="button secondary" data-action="edit">Edit</button><details class="overflow"><summary class="icon-button" aria-label="More actions for question ${i + 1}">${icon("dots")}</summary><div class="overflow-menu"><button data-action="preview">Preview</button><button data-action="duplicate">Duplicate</button><button class="danger-text" data-action="delete">Delete</button></div></details></div></article>`;
                  })
                  .join("")}`;
      list
        .querySelector("#empty-add")
        ?.addEventListener("click", () => edit(undefined));
      list.querySelector("#clear-filters")?.addEventListener("click", () => {
        this.search = "";
        this.category = "";
        refresh();
      });
      list.querySelectorAll("[data-action]").forEach((button) =>
        button.addEventListener("click", () => {
          const node = /** @type {HTMLElement} */ (button);
          const id = /** @type {HTMLElement} */ (node.closest("[data-id]"))
            .dataset.id;
          const q = questions.find((q) => q.id === id);
          if (!q) return;
          const details = node.closest("details");
          if (details) details.open = false;
          switch (node.dataset.action) {
            case "edit":
              edit(q);
              break;
            case "preview":
              previewQuestion(q);
              break;
            case "duplicate":
              openEditor(
                duplicateQuestion(q),
                async (draft) => {
                  await this.repository.duplicate(q.id, draft);
                  refresh();
                  notify("Question duplicated.");
                },
                { title: "Duplicate question" },
              );
              break;
            case "up":
            case "down": {
              const action = node.dataset.action;
              act(
                () =>
                  this.repository.move(q.id, action === "up" ? -1 : 1, mode),
                "Question order saved.",
              );
              const next = root.querySelector(
                `[data-id="${CSS.escape(q.id)}"] [data-action="${action}"]:not(:disabled)`,
              );
              if (next instanceof HTMLElement) next.focus();
              break;
            }
            case "delete": {
              const confirm = modal(
                "Delete this question?",
                `<div class="confirm-content"><p class="delete-title">${escape(q.question)}</p><p>This action cannot be undone. Export your bank first if you need a backup.</p><p class="delete-error form-errors" role="alert" hidden></p></div><footer class="modal-footer"><button class="button secondary" id="cancel-delete">Cancel</button><button class="button danger" id="confirm-delete">Delete question</button></footer>`,
              );
              el("#cancel-delete", confirm.dialog).onclick = confirm.close;
              el("#confirm-delete", confirm.dialog).onclick = async () => {
                confirm.dialog.inert = true;
                confirm.dialog.setAttribute("aria-busy", "true");
                try {
                  await this.repository.delete(q.id, q.revision);
                  refresh();
                  confirm.close();
                  el("#add-question", root).focus();
                  notify("Question deleted.");
                } catch (error) {
                  const box = el(".delete-error", confirm.dialog);
                  box.hidden = false;
                  box.textContent = message(error);
                } finally {
                  confirm.dialog.inert = false;
                  confirm.dialog.removeAttribute("aria-busy");
                }
              };
              break;
            }
          }
        }),
      );
    };
    el("#search", root).addEventListener("input", (event) => {
      this.search = /** @type {HTMLInputElement} */ (event.target).value;
      drawList();
    });
    el("#category-filter", root).addEventListener("change", (event) => {
      this.category = /** @type {HTMLSelectElement} */ (event.target).value;
      drawList();
    });
    drawList();
  }
}
