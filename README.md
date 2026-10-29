# ThreadLine

A local-first desktop workspace for GitHub collaboration.

## Technology Stack

- TypeScript + React + Vite for the interface.
- Rust + Tauri 2 for desktop windows and application commands.
- SQLite through rusqlite with bundled SQLite for local persistence, accessed exclusively by Rust.

## Development

Requires Node.js 22.12+, stable Rust, Visual Studio C++ Build Tools, and WebView2 on Windows. Install GitHub CLI (`gh`) and ensure it is available on PATH before starting the desktop application.

```sh
npm install
npm run desktop
```

Run `npm run dev` to preview the interface in a browser. The local browser preview also reads real GitHub data through a development-only Vite adapter that calls the same Rust GitHub service. `npm run dev` builds its Rust helper automatically. Open `http://127.0.0.1:1420/`; other hosts and origins are rejected. Browser preferences use local storage; GitHub cache and repository selection use a separate SQLite database at `src-tauri/target/browser-preview.db`. The adapter is absent from production builds and `npm run preview`; it never returns GitHub credentials.

```sh
npm run build
npm run check
npm run check:rust
npm run test:rust
npm run desktop:build
```

Desktop builds produce a Windows NSIS installer by default. Configure application signing before publishing a release.

Run `npm run check` before committing. It runs ESLint, Rust Clippy, Prettier, rustfmt, TypeScript checks, frontend command bridge tests, SQLite persistence tests, and frontend and desktop build checks. Use `npm run format` to format source files and `npm test -- src/lib/desktop.test.ts` to run a specific frontend test file. See [AGENTS.md](./AGENTS.md) for contribution rules.

## Current Scope

The interface includes Inbox, Authored Pull Requests, Review Requests, Issues, a pull request detail view, four settings sections, onboarding, snoozed items, and empty and synchronization error states. Search, filters, record previews, local read markers, theme and density changes, and snooze scheduling are interactive.

Collaboration data comes from GitHub through the locally installed GitHub CLI. ThreadLine uses the active `github.com` account; credentials remain managed by `gh` and are never returned to React or stored in the ThreadLine database. No OAuth application registration is needed.

1. Open the desktop application. Existing `gh` authentication is detected automatically.
2. If needed, choose **Log in through gh** and complete verification in the separate login window, then recheck the connection. Alternatively, run `gh auth login --hostname github.com --web --scopes notifications` in a terminal.
3. Select an accessible repository, or enter an accessible public repository as `owner/repository`. Selection is validated against GitHub and saved per account.
4. Use Inbox, Authored, Reviewed, and Issues. Manual refresh and the configured automatic refresh interval request actual GitHub data.

Authored pulls include actual states, review decisions, and HEAD check summaries. Reviewed pulls combine formal reviews, requested reviews, and comment participation, deduplicate results, and compare review commits with the current HEAD. Issues include records involving the current account. Inbox reads repository notifications for PRs and issues; GitHub limits notification history, so it is not a complete repository activity feed. Pull details load descriptions, discussion comments, inline code comments, reviews, file patches, check runs, and commit statuses. Issue previews load descriptions and comments. Descriptions and discussions render sanitized GitHub-flavored Markdown, including foldable details, code blocks, tables, and task lists. Images are shown as links; remote images are not automatically loaded. Links open the corresponding record on GitHub.

The application only reads GitHub data. Read markers and snoozes affect ThreadLine locally. They are scoped by account, repository, and record revision, so a newer notification can become unread again. Themes, density, refresh settings, and snooze deadlines persist locally. Snoozed record summaries survive refreshes and restarts. Notification preferences are retained, but operating system notification delivery is not implemented.

REST and GraphQL list requests follow pagination. GitHub search has a 1,000-result ceiling; exceeding it produces an explicit error. Review summaries include the latest 100 reviews and flag truncated history when a personal review cannot be established; the detail page reads the full paginated review history. GitHub may omit binary or large patches and limits PR file lists to 3,000 files; missing content is disclosed with a link to GitHub. Unsupported notification types are excluded from this PR/issue workspace.

Successful API responses are cached in SQLite by account, repository, operation, and record number. Network failures and rate limits can retain previously loaded records, with a visible error and last successful timestamp. Authentication, permission, and missing-record errors do not load cached private records. A live account check is required before displaying persisted cache. Repository changes discard pending results for the previous repository. Switching or logging out of `gh` requires rechecking the connection; ThreadLine does not log other CLI consumers out.

Private repositories and notifications require suitable `gh` permissions. If needed, run `gh auth refresh --hostname github.com --scopes notifications` yourself. Missing CLI, authentication, permission, rate-limit, network, and timeout failures are shown separately from successful empty lists. GitHub CLI is an external prerequisite, not bundled in the installer.

Tests use isolated fixtures; production views have no sample-data fallback. To run the optional live, read-only API contract test after authenticating `gh`:

```powershell
$env:THREADLINE_LIVE_REPO = 'owner/repository'
$env:THREADLINE_LIVE_PR = '123'
cargo test --locked --manifest-path src-tauri/Cargo.toml live_read_only_github_contract -- --ignored --nocapture
```

The network test is skipped by default and in CI because it requires a user account. Normal tests cover the frontend command contract, mapping, filtering, stale requests, repository access failures, account changes, read-state persistence, and SQLite storage.

The database is stored in Tauri's application data directory as `io.chenmiaoi.threadline/threadline.db`, typically under `%APPDATA%` on Windows. The settings page shows the actual path. Do not commit databases or account credentials to Git.

## Project Structure

```text
src/                     React interface and desktop command bridge
public/assets/figma/     Local design assets
src-tauri/src/           Rust desktop layer and SQLite access
src-tauri/migrations/    Versioned database migrations
src-tauri/capabilities/  Window permissions
```

## Documentation Language

Documentation is written in English by default. Chinese translations must use a `-zh` or `-cn` filename suffix, such as `README-zh.md` or `setup-cn.md`.

## Continuous Integration

GitHub Actions runs the [CI workflow](./.github/workflows/ci.yml) on pushes, pull requests, and manual dispatches. The Windows job installs dependencies with `npm ci`, runs `npm run check`, and builds an unsigned debug NSIS installer using `npm run build:desktop:installer`. Installer artifacts include the license and are retained for seven days. These artifacts are intended for testing; production releases require a separate release build and signing.

CI uses Node.js 24.22.1 and Rust 1.98.1 with Clippy and rustfmt. Actions are pinned to commit hashes, permissions are read-only, and newer runs cancel superseded runs for the same branch or pull request.

## License

ThreadLine is licensed under the GNU General Public License version 3.0 only (`GPL-3.0-only`). See [LICENSE](./LICENSE) for the full license text.

The bundled Inter and Noto Sans SC fonts retain their SIL Open Font License notices in [public/licenses/inter-OFL.txt](./public/licenses/inter-OFL.txt) and [public/licenses/noto-sans-sc-OFL.txt](./public/licenses/noto-sans-sc-OFL.txt).
