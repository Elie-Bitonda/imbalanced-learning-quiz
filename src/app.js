import { QuestionRepository, STORAGE_KEY } from "./data/repository.js";
import { StudySession } from "./ui/study.js";
import { QuestionManager } from "./ui/manager.js";
import { escape, icon, el, message, download, notify } from "./ui/dom.js";
import {
  STUDY_MODES,
  LEVEL_LABELS,
  modeFromQuery,
  questionsForMode,
  levelUrl,
} from "./data/difficulty.js";
import { studyLevelSelector } from "./ui/level-selector.js";
import { openEditor } from "./ui/editor.js";
import { config, routeHref, currentRoute } from "./routing.js";
import { SharedQuestionRepository } from "./data/shared-repository.js";
import { connectSupabase, EditorAuth } from "./data/supabase.js";
import { openSignIn, openPasswordChange } from "./ui/auth.js";
import { backupLocalBank, openLocalMigration } from "./ui/local-migration.js";

// Defer storage access until repository operations so blocked storage has a recoverable UI.
const localRepository = new QuestionRepository({
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
});
const client =
  config.mode === "shared" && config.supabaseUrl && config.supabaseKey
    ? connectSupabase(config)
    : null;
const auth = client ? new EditorAuth(client) : null;
const shared = client
  ? new SharedQuestionRepository(async (name, args) => {
      const { data, error } = await client.rpc(name, args);
      if (error) throw new Error(error.message);
      return data;
    })
  : null;
const repository = shared || localRepository;
let ready = config.mode === "local";
let loadError = "";
let polling = false;
const canEdit = () => config.mode === "local" || auth?.canEdit === true;
const sessions = new Map(
  STUDY_MODES.map((mode) => [mode, new StudySession(mode)]),
);
const manager = new QuestionManager(repository, () => render());
const DEFAULT_RELEASE_STATE = Object.freeze({
  mixed: true,
  beginner: true,
  medium: true,
  pro: true,
});
const RELEASE_ORDER = /** @type {import('./models').StudyMode[]} */ ([
  "beginner",
  "medium",
  "pro",
  "mixed",
]);
let releaseState = { ...DEFAULT_RELEASE_STATE };
let releaseControlsReady = config.mode === "local";

async function refreshReleaseState() {
  if (!client) return;
  const { data, error } = await client.rpc("read_study_level_releases");
  if (error) {
    if (
      error.code === "PGRST202" ||
      error.message.includes("read_study_level_releases")
    ) {
      releaseControlsReady = false;
      releaseState = { ...DEFAULT_RELEASE_STATE };
      return;
    }
    throw new Error(error.message);
  }
  if (!data || typeof data !== "object")
    throw new Error("The presentation release state is invalid.");
  releaseControlsReady = true;
  releaseState = { ...DEFAULT_RELEASE_STATE, ...data };
}

async function setRelease(level, released) {
  if (!client || !auth?.canEdit)
    throw new Error("Editor access is required to release study levels.");
  const { data, error } = await client.rpc("set_study_level_release", {
    target_level: level,
    new_released: released,
  });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object")
    throw new Error("The presentation release state is invalid.");
  releaseControlsReady = true;
  releaseState = { ...DEFAULT_RELEASE_STATE, ...data };
}

function renderReleaseControls(root) {
  const panel = document.createElement("section");
  panel.className = "release-panel";
  if (!releaseControlsReady) {
    panel.innerHTML =
      '<div class="release-panel-heading"><div><div class="eyebrow">PRESENTATION ACCESS</div><h2>Level release controls</h2><p>Run the level-release migration in Supabase to enable presentation locks.</p></div></div>';
    root.prepend(panel);
    return;
  }
  panel.innerHTML = `<div class="release-panel-heading"><div><div class="eyebrow">PRESENTATION ACCESS</div><h2>Release levels when each section is complete</h2><p>Learner pages check for changes every 15 seconds. Editors can preview locked levels.</p></div></div><div class="release-grid">${RELEASE_ORDER.map(
    (level) => {
      const released = releaseState[level] === true;
      return `<article class="release-card"><div><strong>${LEVEL_LABELS[level]}</strong><span class="release-status ${released ? "released" : "locked"}">${released ? "Available to learners" : "Locked"}</span></div><div class="release-actions"><button class="button ${released ? "ghost" : "primary"}" data-release-level="${level}" data-release-value="${released ? "false" : "true"}">${released ? "Lock" : "Release"}</button><button class="button secondary" data-copy-level="${level}">Copy link</button></div></article>`;
    },
  ).join("")}</div>`;
  panel.querySelectorAll("[data-release-level]").forEach((button) => {
    button.addEventListener("click", async () => {
      const node = /** @type {HTMLElement} */ (button);
      const level = /** @type {import('./models').StudyMode} */ (
        node.dataset.releaseLevel
      );
      const released = node.dataset.releaseValue === "true";
      panel.setAttribute("aria-busy", "true");
      try {
        await setRelease(level, released);
        render();
        notify(
          `${LEVEL_LABELS[level]} is now ${released ? "available to learners" : "locked"}.`,
        );
      } catch (error) {
        notify(message(error));
      } finally {
        panel.removeAttribute("aria-busy");
      }
    });
  });
  panel.querySelectorAll("[data-copy-level]").forEach((button) => {
    button.addEventListener("click", async () => {
      const level = /** @type {import('./models').StudyMode} */ (
        /** @type {HTMLElement} */ (button).dataset.copyLevel
      );
      const url = new URL(levelUrl(level), location.origin).href;
      try {
        await navigator.clipboard.writeText(url);
        notify(`${LEVEL_LABELS[level]} link copied.`);
      } catch {
        notify(`Copy this link: ${url}`);
      }
    });
  });
  root.prepend(panel);
}

function render() {
  const manage =
    currentRoute().pathname.replace(/\/$/, "") === "/multiple-choice/manage";
  const mode = modeFromQuery(
    new URLSearchParams(currentRoute().search).get("level"),
    manage,
  );
  document.title = `${manage ? "Question Manager" : "Multiple Choice"} · Forma`;
  el("#app").innerHTML =
    `<aside class="sidebar"><a class="brand" href="/multiple-choice" aria-label="Forma study home"><span class="brand-mark">f<span>•</span></span>forma<span class="brand-period">.</span></a><div class="workspace-label">LEARNING WORKSPACE</div><nav aria-label="Main navigation"><a class="nav-link ${manage ? "" : "active"}" ${manage ? "" : 'aria-current="page"'} href="/multiple-choice">${icon("book")}<span>Study</span>${manage ? "" : '<span class="nav-dot"></span>'}</a><a class="nav-link ${manage ? "active" : ""}" ${manage ? 'aria-current="page"' : ""} href="/multiple-choice/manage">${icon("grid")}<span>Question Manager</span></a></nav><div class="sidebar-note"><span class="note-symbol">✦</span><h2>Understanding<br>starts with curiosity.</h2><p>One question at a time.<br>At your own pace.</p><div class="note-lines"><i></i><i></i><i></i></div></div><div class="sidebar-bottom"><span class="avatar">Y</span><div><strong>Your workspace</strong><small>Personal learning</small></div><span class="local-dot" title="Local workspace"></span></div></aside><div class="app-content"><header class="topbar"><span>Workspace <span class="breadcrumb-slash">/</span><strong>${manage ? "Question Manager" : "Multiple Choice"}</strong></span><div class="account-controls"><span class="local-badge"><span></span> ${config.mode === "local" ? "Local demo" : "Shared workspace"}</span>${auth ? (auth.email ? `<button class="button ghost" id="change-password">Account</button><button class="button ghost" id="sign-out">Sign out</button>` : `<button class="button secondary" id="sign-in">Editor sign in</button>`) : ""}</div></header><main id="main" tabindex="-1"></main><footer class="app-footer"><span>A little learning, every day.</span><span>Made for curious minds.</span></footer></div>`;
  document
    .querySelectorAll('a[href^="/multiple-choice"]')
    .forEach((link) =>
      link.setAttribute(
        "href",
        routeHref(link.getAttribute("href") || "/multiple-choice"),
      ),
    );
  if (!canEdit())
    document.querySelector('.sidebar a[href*="manage"]')?.remove();
  if (auth) {
    document.querySelector("#sign-in")?.addEventListener("click", () =>
      openSignIn(auth, async () => {
        await load();
      }),
    );
    document
      .querySelector("#change-password")
      ?.addEventListener("click", () => openPasswordChange(auth));
    document.querySelector("#sign-out")?.addEventListener("click", async () => {
      try {
        await auth.signOut();
        render();
      } catch (error) {
        notify(message(error));
      }
    });
  }
  const main = el("#main");
  if (config.mode !== "local" && !client) {
    main.innerHTML =
      '<section class="empty"><h1>Connect your shared workspace</h1><p>Set SUPABASE_URL and SUPABASE_ANON_KEY, apply the database migration, and rebuild. Your earlier local questions have not been changed.</p><button class="button secondary" id="local-backup">Download existing local questions</button></section>';
    el("#local-backup", main).onclick = backupLocalBank;
    return;
  }
  if (!ready) {
    main.innerHTML = loadError
      ? `<section class="empty"><h1>Couldn’t load the shared question bank</h1><p role="alert">${escape(loadError)}</p><button class="button primary" id="retry-shared">Try again</button></section>`
      : '<section class="empty" role="status"><h1>Loading your question bank…</h1></section>';
    main
      .querySelector("#retry-shared")
      ?.addEventListener("click", () => void load());
    return;
  }
  try {
    if (manage && !canEdit()) {
      main.innerHTML = `<section class="empty"><h1>Editor access required</h1><p>${auth?.email ? "You are signed in as a learner. Ask your group administrator for editor access." : "Sign in with an authorized editor account to manage shared questions."}</p>${!auth?.email ? '<button class="button primary" id="manage-sign-in">Editor sign in</button>' : ""}</section>`;
      main.querySelector("#manage-sign-in")?.addEventListener("click", () => {
        if (auth) openSignIn(auth, load);
      });
    } else if (manage) {
      manager.render(main, mode);
      if (shared) {
        renderReleaseControls(main);
        el(".storage-note", main).innerHTML =
          "Saved to the shared database. Open pages check for changes every 15 seconds.";
        const tools = document.createElement("div");
        tools.className = "migration-actions";
        tools.innerHTML =
          '<button class="button ghost" id="backup-local">Back up local questions</button><button class="button secondary" id="migrate-local">Migrate existing questions</button>';
        main.append(tools);
        el("#backup-local", main).onclick = backupLocalBank;
        el("#migrate-local", main).onclick = () =>
          openLocalMigration(shared, render);
      }
    } else {
      const studyMode = /** @type {import('./models').StudyMode} */ (mode);
      const questions = repository.list();
      const filtered = questionsForMode(questions, studyMode);
      const released = releaseState[studyMode] !== false;
      const selector = studyLevelSelector(
        questions,
        studyMode,
        releaseState,
        canEdit(),
      );
      if (!released && !canEdit()) {
        main.innerHTML = `${selector}<section class="empty level-locked-message"><span class="empty-icon">${icon("shield")}</span><h1>${LEVEL_LABELS[studyMode]} is locked for now</h1><p>Your presenter will release this level when that part of the presentation is complete. This page checks automatically, so you can keep it open.</p></section>`;
        return;
      }
      main.innerHTML = `${selector}${canEdit() && studyMode !== "mixed" && filtered.length ? `<div class="level-study-actions"><span>${LEVEL_LABELS[studyMode]} Questions</span><button class="button secondary" id="add-level-question">${icon("plus")} Add ${LEVEL_LABELS[studyMode]} Question</button></div>` : ""}<div id="study-session"></div>`;
      sessions.get(studyMode)?.render(el("#study-session", main), filtered);
      if (!canEdit()) {
        main.querySelector("#add-level-question")?.remove();
        main.querySelector(".empty a[href*=manage]")?.remove();
      }
      main.querySelector("#add-level-question")?.addEventListener("click", () =>
        openEditor(
          undefined,
          async (draft) => {
            if (!canEdit()) throw new Error("Editor access is required.");
            await repository.save(draft);
            render();
            notify("Question saved.");
          },
          { difficulty: studyMode === "mixed" ? "general" : studyMode },
        ),
      );
    }
  } catch (error) {
    main.innerHTML = `<section class="empty"><span class="empty-icon">${icon("shield")}</span><h1>We couldn’t open your question bank</h1><p class="error-detail">${escape(message(error))}</p><p>Your stored data has not been overwritten. Try again or download it for recovery.</p><div class="button-row"><button class="button primary" id="retry">Try again</button><button class="button secondary" id="recover">Download stored data</button></div></section>`;
    el("#retry").onclick = render;
    el("#recover").onclick = () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === null) notify("No stored bank was found.");
        else download("forma-recovery.json", raw);
      } catch (error) {
        notify(message(error));
      }
    };
  }
}
document.addEventListener("click", (event) => {
  if (
    !(event.target instanceof Element) ||
    event.button !== 0 ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  const link = event.target.closest("a");
  if (
    !link ||
    link.origin !== location.origin ||
    !["/multiple-choice", "/multiple-choice/manage"].includes(
      new URL(
        link.hash.startsWith("#/") ? link.hash.slice(1) : link.pathname,
        location.origin,
      ).pathname,
    )
  )
    return;
  event.preventDefault();
  const route = new URL(
    link.hash.startsWith("#/")
      ? link.hash.slice(1)
      : link.pathname + link.search,
    location.origin,
  );
  history.pushState({}, "", routeHref(route.pathname + route.search));
  render();
  el("#main").focus();
  window.scrollTo(0, 0);
});
window.addEventListener("popstate", render);
window.addEventListener("hashchange", render);
window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY)
    notify(
      "Your bank changed in another tab. Refresh this page before editing to use the latest version.",
    );
});
async function load() {
  if (!shared || !auth) {
    render();
    return;
  }
  try {
    await Promise.all([shared.refresh(), auth.refresh(), refreshReleaseState()]);
    ready = true;
    loadError = "";
  } catch (error) {
    loadError = message(error);
    ready = false;
  }
  render();
}
async function poll() {
  if (
    !shared ||
    !auth ||
    !ready ||
    polling ||
    document.hidden ||
    document.querySelector('dialog, [aria-busy="true"]')
  )
    return;
  polling = true;
  try {
    const before = shared.version,
      wasEditor = auth.canEdit,
      beforeReleases = JSON.stringify(releaseState);
    await Promise.all([shared.refresh(), auth.refresh(), refreshReleaseState()]);
    if (
      before !== shared.version ||
      wasEditor !== auth.canEdit ||
      beforeReleases !== JSON.stringify(releaseState)
    )
      render();
  } catch {
    notify(
      "Could not check shared updates. Showing the last loaded bank; reconnect to get new changes.",
    );
  } finally {
    polling = false;
  }
}
if (client) {
  // Never await Supabase operations inside its synchronous auth callback.
  client.auth.onAuthStateChange(() => {
    setTimeout(() => {
      if (!document.querySelector("dialog")) void load();
    }, 0);
  });
  setInterval(() => void poll(), 15000);
  window.addEventListener("focus", () => void poll());
  window.addEventListener("online", () => void poll());
}
render();
if (shared) void load();
