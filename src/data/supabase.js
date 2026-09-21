import { createClient } from "@supabase/supabase-js";
/** @param {import('../models').AppConfig} config */
export function connectSupabase(config) {
  return createClient(config.supabaseUrl, config.supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: init?.signal || AbortSignal.timeout(20000),
        }),
    },
  });
}

export class EditorAuth {
  /** @param {ReturnType<typeof connectSupabase>} client */
  constructor(client) {
    this.client = client;
    this.email = "";
    this.canEdit = false;
  }
  async refresh() {
    const { data, error } = await this.client.auth.getSession();
    if (error) throw new Error(error.message);
    this.email = data.session?.user.email || "";
    this.canEdit = false;
    if (data.session) {
      const result = await this.client.rpc("is_question_editor");
      if (result.error) throw new Error(result.error.message);
      this.canEdit = result.data === true;
    }
  }
  /** @param {string} email @param {string} password */
  async signIn(email, password) {
    const { error } = await this.client.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw new Error(error.message);
    await this.refresh();
  }
  async signOut() {
    const { error } = await this.client.auth.signOut();
    if (error) throw new Error(error.message);
    this.email = "";
    this.canEdit = false;
  }
  /** @param {string} password */
  async changePassword(password) {
    const { error } = await this.client.auth.updateUser({ password });
    if (error) throw new Error(error.message);
  }
}
