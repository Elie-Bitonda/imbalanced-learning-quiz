import { modal, el, message, notify } from "./dom.js";
/** @param {import('../data/supabase').EditorAuth} auth @param {() => void | Promise<void>} refresh */
export function openSignIn(auth, refresh) {
  const { dialog, close } = modal(
    "Editor sign in",
    '<form class="auth-form"><p>Sign in with the account your group administrator created. Studying does not require an account.</p><label class="field">Email<input name="email" type="email" autocomplete="username" required /></label><label class="field">Password<input name="password" type="password" autocomplete="current-password" required /></label><p class="form-errors" role="alert" hidden></p><button class="button primary" type="submit">Sign in</button></form>',
  );
  const form = /** @type {HTMLFormElement} */ (el("form", dialog));
  form.onsubmit = async (event) => {
    event.preventDefault();
    const submit = /** @type {HTMLButtonElement} */ (
      el('[type="submit"]', form)
    );
    submit.disabled = true;
    try {
      const data = new FormData(form);
      await auth.signIn(
        String(data.get("email")),
        String(data.get("password")),
      );
      await refresh();
      close();
      if (!auth.canEdit)
        notify(
          "Signed in as a learner. Ask the group administrator for editor access.",
        );
    } catch (error) {
      const box = el('[role="alert"]', form);
      box.hidden = false;
      box.textContent = message(error);
    } finally {
      submit.disabled = false;
    }
  };
}
/** @param {import('../data/supabase').EditorAuth} auth */
export function openPasswordChange(auth) {
  const { dialog, close } = modal(
    "Change password",
    '<form class="auth-form"><label class="field">New password<input name="password" type="password" autocomplete="new-password" minlength="12" required /></label><p>Use at least 12 characters.</p><p class="form-errors" role="alert" hidden></p><button class="button primary" type="submit">Save password</button></form>',
  );
  const form = /** @type {HTMLFormElement} */ (el("form", dialog));
  form.onsubmit = async (event) => {
    event.preventDefault();
    const submit = /** @type {HTMLButtonElement} */ (
      el('[type="submit"]', form)
    );
    submit.disabled = true;
    try {
      await auth.changePassword(String(new FormData(form).get("password")));
      close();
      notify("Password changed.");
    } catch (error) {
      const box = el('[role="alert"]', form);
      box.hidden = false;
      box.textContent = message(error);
    } finally {
      submit.disabled = false;
    }
  };
}
