# Forma · Multiple Choice

The existing browser-native HTML/CSS/JavaScript application now supports a shared Supabase question bank, Supabase email/password authentication, and GitHub Pages deployment. The interface, difficulty modes, answer feedback, explanations, previews, and study sessions are preserved. The existing Node build now uses esbuild to bundle the official Supabase JavaScript client; no UI framework has been introduced.

**Project setup status:** the integration, SQL migrations, and deployment workflow are included. You must create/configure your Supabase project, migrate your questions, and connect your GitHub repository before this becomes a live shared site. No remote project or credentials are included.

## 1. Install and configure locally

Use **Node.js 24** and **pnpm 11.19.0**.

```sh
pnpm install --frozen-lockfile
```

Copy `.env.example` to `.env` and supply your project's public configuration:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_LEGACY_ANON_KEY
PERSISTENCE_MODE=shared
```

Use the Supabase project URL and **publishable key** from its API settings (a legacy **anon** key also works). The variable retains the name `SUPABASE_ANON_KEY` for either format. Never use `service_role` or an `sb_secret_` key. The build rejects those privileged formats. Only an explicit allowlist of public configuration is bundled; `.env` and other environment files are ignored by Git.

These values are necessarily visible in browser code. Access is protected by database policies and authenticated users, not by keeping the public key secret. See [Supabase API keys](https://supabase.com/docs/guides/api/api-keys) and [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).

```sh
pnpm dev
```

- Study: `http://127.0.0.1:4173/multiple-choice`
- Manager: `http://127.0.0.1:4173/multiple-choice/manage`

Restart the development server after code or environment changes; it builds the browser bundle at startup. Without Supabase configuration, shared mode displays setup instructions and a local-backup download action. It never silently saves shared questions into localStorage.

### Existing offline app / backup access

```sh
pnpm dev:local
```

This is an **explicit local demo**, using the original localStorage key and original authoring behavior without accounts. It is useful for exporting your old bank or running the regression suite. It is not the shared deployment. The deployment workflow rejects local mode.

## 2. Create the Supabase database

Create a Supabase project. In its SQL Editor, open and run:

1. `supabase/migrations/202609210001_shared_questions.sql`

Run that migration once, or manage it with Supabase CLI migrations (`supabase link --project-ref YOUR_PROJECT_REF`, then `supabase db push`). Do not repeatedly paste the migration into an already-initialized project.

It creates:

| Table                 | Purpose                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `questions`           | One shared bank, including JSONB answers, stable text IDs, difficulty, metadata, order, timestamps, creator, and revision |
| `question_editors`    | Authorized Auth user IDs; membership can only be changed by the project administrator                                     |
| `question_bank_state` | Shared revision counter for polling and safe bulk operations                                                              |

There is no Mixed table. Answers must contain at least two nonempty options, unique IDs, and exactly one correct option, enforced in both JavaScript and SQL. Difficulty is constrained to `general`, `beginner`, `medium`, or `pro`. Triggers track attribution, timestamps, and revisions. Public users can read questions; only authorized authenticated editors can insert, update, or delete. Users cannot grant themselves editor access. All exposed tables have RLS enabled.

Mutations use the transactional `mutate_questions` RPC. Content saves and deletes check question revisions; reorder and replacement import check the bank revision. A stale operation produces an error instead of silently replacing a teammate's work. The editor retains an unsaved draft after a failed save. A single `read_question_bank` snapshot avoids table API pagination limits.

## 3. Authentication and groupmate accounts

In Supabase **Authentication**:

1. Enable the email/password provider.
2. Disable public user signups if this is a closed group. There is no public signup form in the app.
3. Under Users, use **Add user / Create user** to create an email/password account for yourself and each groupmate. Mark the account confirmed using the administrator's create-user option so it can sign in.
4. Choose a unique temporary password and give it to that groupmate privately. They can use **Account → Change password** after signing in. The app supports password login; email invitation and magic-link callback flows are not used.
5. Open `supabase/editor-access.sql`, replace its placeholder email with the account's email, and run it to grant editor access. Repeat for each authorized editor. The same file contains the revocation query.

Merely creating an Auth account does **not** grant editor permissions. A signed-in account without membership remains a learner. The app checks membership on login and during refresh, and the database enforces it on every write even when the frontend is stale or manipulated.

Set the Auth **Site URL** to the final GitHub Pages root, e.g. `https://OWNER.github.io/REPOSITORY/`. Keep the local origin available during development if using Supabase's other email flows administratively. Password login does not require a redirect. Account recovery/reset administration can be handled by the Supabase project owner; this app does not provide an email recovery callback page.

The Supabase SDK stores and refreshes the login session in the browser. Questions themselves are stored in PostgreSQL, not in the SDK's browser session storage. Sign out on shared devices.

## 4. Preserve and migrate existing local questions

The earlier app stored its bank in localStorage at `forma.multiple-choice.questions.v1`, scoped to its original browser/device/origin. These records are **not deleted, reset, or automatically uploaded**. A website at a new domain cannot read storage from localhost.

1. In the original browser and at the original local origin, download a bank backup using the old Export action, `pnpm dev:local`, or the unconfigured app's **Download existing local questions** action.
2. Start the configured shared app and sign in as an editor.
3. Open **Question Manager → Migrate existing questions**.
4. Choose that backup, or select **Read this browser's old bank** if you are still on the same origin.
5. Review the validated count and existing-ID count, then click **Migrate questions**.
6. Check the shared bank from a second browser/device before retiring the old copy. Keep the backup.

Migration preserves question and answer IDs. Repeating it skips existing question IDs rather than overwriting shared edits or adding copies. The local bank and backup stay unchanged. Missing/null/blank difficulty maps to General; old Easy, Medium, and Hard labels map to Beginner, Medium, and Pro respectively. Older timestamps are accepted; the database tracks the time of the shared write in `updated_at` and the migrating account in `created_by`.

**Migrate before seeding.** Only for a brand-new empty bank with no local questions to migrate, optionally run `supabase/seed.sql`. It inserts the original imbalanced-learning question only when the entire bank is empty. It is not run on application load. Do not seed first and then migrate a separate copy of that same question with a different ID.

Normal **Import** remains available for transfers: Append generates fresh IDs for intentional copies; Replace requires acknowledgement and a matching bank revision. For a nonduplicating upgrade from the local app, use **Migrate existing questions**, not normal Import. Export includes the full bank, independent of the manager's active filter.

## 5. Shared learning and editing behavior

- Learners can study without login; management routes and controls require an authorized editor.
- A single saved question appears in its difficulty section and Mixed automatically.
- Mixed includes Beginner, Medium, Pro, and General. It shuffles IDs once per session, retaining order through navigation, explanations, review, and mode switching. A fresh session reshuffles the current bank. Level-specific modes retain authored order.
- Newly received questions join an active Mixed session without moving existing questions. Deleted IDs are removed; difficulty changes retain the same ID in Mixed. Counts are calculated from the shared snapshot.
- Each mode has independent in-memory progress. A page reload starts new study sessions; question content persists across devices.
- Create/edit/delete/import/reorder return the committed bank immediately. Other open pages poll every **15 seconds**, and on focus/reconnection. Polling pauses while a dialog or mutation is active to avoid disrupting drafts. This uses reliable refetching, not a Supabase realtime subscription.
- If updates cannot be fetched, the interface reports it and retains its last loaded view. It does not silently fall back to local-only writes. Initial failures have a retry screen.
- Search, category filters, difficulty filters, preview, duplicate drafts, and deletion confirmation remain available in the manager.

## 6. Build and test

```sh
pnpm format
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

`pnpm test` includes real PostgreSQL SQL/RLS tests using an isolated PGlite runtime with Supabase Auth role stubs. It checks unauthorized access, editor access, transactions, constraints, stale edits, migration, and repository behavior. These are not tests against your live Supabase project.

`pnpm test:e2e` starts its own local demo server on port 4181 (override `TEST_PORT` if needed), runs the existing learning/authoring/difficulty/shuffle suites, and then tests a bundled shared app at a simulated GitHub Pages subpath. Shared browser tests use mocked Supabase HTTP responses and two isolated browser contexts. Google Chrome must be installed (`BROWSER_CHANNEL` can choose another installed Playwright channel). Tests never touch your regular browser's saved questions.

`pnpm build` generates only deployable files in `dist/`, using hash routing and a bundled Supabase client. Without configuration it builds a setup screen, not an operational shared site. Set `REQUIRE_SHARED_CONFIG=true` to enforce configuration; the deployment workflow does this automatically. `dist/` is ignored by Git and rebuilt cleanly.

For an additional production-path check, set `APP_BASE_PATH=/REPOSITORY/` before building. Assets are emitted with that base path. Normal local development retains its existing History API routes; production links use `/REPOSITORY/#/multiple-choice?level=pro` and `/REPOSITORY/#/multiple-choice/manage`. Because the route is after `#`, refreshing it requests the existing root HTML rather than an unknown GitHub Pages path.

## 7. Push to GitHub and enable Pages

Create an empty GitHub repository. This project folder was not originally a Git repository. From this folder, if it has not already been initialized:

```sh
git init
git branch -M main
git add .
git commit -m "Prepare shared multiple-choice app for GitHub Pages"
git remote add origin https://github.com/OWNER/REPOSITORY.git
git push -u origin main
```

Replace OWNER and REPOSITORY. If Git and a remote already exist, use the existing remote and normal commit/push flow. Check `git status` before committing; `.env`, dependency stores, `node_modules/`, `dist/`, and test screenshots are ignored. Never force-add environment files or secret keys.

In the GitHub repository:

1. **Settings → Secrets and variables → Actions → New repository secret**:
   - `SUPABASE_URL`: your Supabase project URL.
   - `SUPABASE_ANON_KEY`: its publishable key or legacy anon key.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push to `main`, or open **Actions → Deploy shared study app → Run workflow**.

`.github/workflows/deploy.yml` checks out the repo, installs locked dependencies, runs formatting/lint/type/unit/database checks, configures Pages, determines the base path, builds with the two public configuration values, uploads `dist/` as a Pages artifact, and deploys it. The deployment job has the `pages: write` and `id-token: write` permissions and uses the `github-pages` environment. It follows GitHub's [custom Pages workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

Expected URL:

```text
https://OWNER.github.io/REPOSITORY/#/multiple-choice
https://OWNER.github.io/REPOSITORY/#/multiple-choice/manage
```

For an `OWNER.github.io` repository or a root custom domain, the repository path is omitted; the workflow obtains the base path from Pages automatically. A new commit to main redeploys automatically. After changing an Actions secret, run the workflow again so the public configuration is rebuilt.

No service-role key is required in the frontend or in GitHub Actions. Schema changes are applied separately through the Supabase SQL editor/CLI, not by the frontend deployment job.

## 8. Before sharing the public URL

After applying the SQL and configuring the real project, perform a live smoke test: sign in as an editor, add a question, open an incognito learner window, wait for the shared count to update, verify the new question in its level and Mixed, reload a hash route, and confirm an unapproved account cannot write. The automated mocks and local PostgreSQL tests do not establish that your particular cloud project or GitHub deployment has been configured correctly.

## Important files

- `src/data/shared-repository.js`: centralized shared reads/mutations and revision checks.
- `src/data/supabase.js`: official client and editor authentication.
- `src/data/repository.js`: preserved explicit local-demo adapter and old storage key.
- `src/ui/auth.js`, `src/ui/local-migration.js`: sign-in/account controls and nonduplicating local migration.
- `src/app.js`, `src/routing.js`: loading, permissions, polling, and deployment-aware routing.
- `src/ui/manager.js`, `editor.js`, `import.js`: existing UI extended to await shared writes.
- `supabase/migrations/`, `supabase/editor-access.sql`, `supabase/seed.sql`: complete database setup.
- `tools/config.mjs`, `bundle.mjs`, `build.mjs`: allowlisted environment configuration and static build.
- `.github/workflows/deploy.yml`: GitHub Pages deployment.
