/** Escape all user-authored content before inserting templates. @param {unknown} value */
export const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] || c,
  );
/** @param {string} selector @param {ParentNode} [root] @returns {HTMLElement} */
export function el(selector, root = document) {
  const found = root.querySelector(selector);
  if (!(found instanceof HTMLElement))
    throw new Error(`Missing element: ${selector}`);
  return found;
}
/** @type {ReturnType<typeof setTimeout> | undefined} */
let notificationTimer;
/** @param {string} text */
export function notify(text) {
  clearTimeout(notificationTimer);
  el("#notifications").textContent = text;
  notificationTimer = setTimeout(() => {
    el("#notifications").textContent = "";
  }, 7000);
}
/** @param {unknown} error */
export const message = (error) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
/** @param {string} name */
export function icon(name) {
  /** @type {Record<string, string>} */
  const paths = {
    check: '<path d="m5 12 4 4L19 6"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    next: '<path d="m9 5 7 7-7 7"/>',
    previous: '<path d="m15 5-7 7 7 7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    book: '<path d="M12 6C8 3 4 4 3 5v14c3-2 6-1 9 1 3-2 6-3 9-1V5c-3-2-6-1-9 1Zm0 0v14"/>',
    grid: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
    bulb: '<path d="M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 2H9s0-1-1-2Z"/>',
    search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
    up: '<path d="m6 14 6-6 6 6"/>',
    down: '<path d="m6 10 6 6 6-6"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
    dots: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    shield:
      '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  };
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.book}</svg>`;
}
/** Native dialog supplies focus trapping, Escape dismissal, and inert background. @param {string} title @param {string} body @param {string} [className] */
export function modal(title, body, className = "") {
  const previous = document.activeElement;
  const dialog = document.createElement("dialog");
  dialog.className = `modal ${className}`;
  const label = `dialog-${crypto.randomUUID()}`;
  dialog.setAttribute("aria-labelledby", label);
  dialog.innerHTML = `<header class="modal-header"><h2 id="${label}">${escape(title)}</h2><button class="icon-button" data-close aria-label="Close dialog">${icon("close")}</button></header>${body}`;
  document.body.append(dialog);
  // Keep Tab inside the dialog instead of cycling through browser chrome.
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const focusable = [
      ...dialog.querySelectorAll(
        "button, input, textarea, select, a[href], [tabindex]",
      ),
    ].filter(
      (node) =>
        node instanceof HTMLElement &&
        node.tabIndex >= 0 &&
        !node.matches(":disabled") &&
        node.getClientRects().length > 0,
    );
    const first = /** @type {HTMLElement | undefined} */ (focusable[0]);
    const last = /** @type {HTMLElement | undefined} */ (focusable.at(-1));
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  });
  const close = () => dialog.close();
  el("[data-close]", dialog).onclick = close;
  dialog.addEventListener("close", () => {
    dialog.remove();
    if (previous instanceof HTMLElement && previous.isConnected)
      previous.focus();
    else document.querySelector("main")?.focus({ preventScroll: true });
  });
  dialog.showModal();
  return { dialog, close };
}
/** @param {string} filename @param {string} content */
export function download(filename, content) {
  const url = URL.createObjectURL(
    new Blob([content], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
