import {
  STUDY_MODES,
  LEVEL_LABELS,
  MODE_DESCRIPTIONS,
  questionsForMode,
  levelUrl,
} from "../data/difficulty.js";
import { escape } from "./dom.js";

/** @param {import('../models').Question[]} questions @param {import('../models').StudyMode} active */
export function studyLevelSelector(questions, active) {
  return `<section class="level-selector" aria-labelledby="practice-level-heading"><div class="level-selector-heading"><h2 id="practice-level-heading">Choose your practice level</h2><span>${LEVEL_LABELS[active]} practice</span></div><nav class="level-options" aria-label="Study level">${STUDY_MODES.map(
    (mode) => {
      const count = questionsForMode(questions, mode).length;
      return `<a href="${levelUrl(mode)}" class="level-option ${active === mode ? "active" : ""}" ${active === mode ? 'aria-current="page"' : ""}><span class="level-option-title">${LEVEL_LABELS[mode]}<span class="level-count">${count}</span></span><span class="level-description">${MODE_DESCRIPTIONS[mode]}</span><span class="sr-only">${count} ${count === 1 ? "question" : "questions"}</span></a>`;
    },
  ).join("")}</nav></section>`;
}

/** @param {import('../models').Question[]} questions @param {import('../models').StudyMode | 'general'} active */
export function managerLevelSelector(questions, active) {
  return `<nav class="manager-levels" aria-label="Filter by difficulty">${[
    ...STUDY_MODES,
    "general",
  ]
    .map((value) => {
      const mode = /** @type {import('../models').StudyMode | 'general'} */ (
        value
      );
      const label =
        mode === "mixed"
          ? "All"
          : mode === "general"
            ? "General / Legacy"
            : LEVEL_LABELS[mode];
      return `<a href="${levelUrl(mode, true)}" class="level-filter ${active === mode ? "active" : ""}" ${active === mode ? 'aria-current="page"' : ""}>${escape(label)} <span>${questionsForMode(questions, mode).length}</span></a>`;
    })
    .join("")}</nav>`;
}
