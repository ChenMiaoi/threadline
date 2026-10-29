# ThreadLine

A local-first desktop workspace for GitHub collaboration.

## Technology Stack

- TypeScript + React + Vite for the interface.
- Rust + Tauri 2 for desktop windows and application commands.
- Direct HTTPS access to GitHub REST and GraphQL APIs.
- An application-owned encrypted credential vault and locally managed random encryption key, without OS credential-store access.
- SQLite through rusqlite with bundled SQLite for local persistence, accessed exclusively by Rust.

## Development

Requires Node.js 24.15+ and stable Rust. On macOS, install Xcode Command Line Tools (`xcode-select --install`). On Windows, install Visual Studio C++ Build Tools and WebView2. GitHub CLI is not required and its credentials are not used.

```sh
npm ci
npm run desktop
```

Run `npm run dev` to preview the interface in a browser. The development-only Vite adapter calls the same Rust GitHub services, including the independent app's encrypted vault. Its Rust helper is built automatically. Open `http://127.0.0.1:1420/`; other hosts and origins are rejected. Browser preferences use local storage; GitHub cache and repository selection use a separate SQLite database at `src-tauri/target/browser-preview.db`. The adapter is absent from production builds and `npm run preview`; it never returns credentials to the browser.

```sh
npm run build
npm run check
npm run check:rust
npm run test:rust
npm run desktop:build
```

Desktop builds produce a Windows NSIS installer on Windows and an `.app` plus `.dmg` on macOS. macOS uses a native system titlebar and traffic-light controls. Local unsigned builds are for development. Configure signing and macOS notarization before publishing a release.

To investigate loading time, open **Settings → Account and connection → Loading diagnostics** (shown as **设置 → 账号与连接 → 加载诊断** in the current interface). It reports backend stages, client waiting time, and React commit timing for the most recent loads in the current workspace. Client timing includes IPC and backend work; a joined in-flight request can report only the remaining wait. Commit timing excludes screen refresh and Computer Use overhead. These diagnostics contain operation labels and durations, not credentials or record content.

The development helper can also measure the same Rust services without browser queueing. It uses the existing ThreadLine login and prints timings only; it does not print payloads or credentials:

```sh
npm run build:github-preview
src-tauri/target/debug/github-preview --measure llvm/llvm-project 229328
```

Use `--measure-full` instead of `--measure` to measure the supported aggregate detail operation. The desktop interface uses staged reads: the overview arrives first, and discussion, file, and check reads are independent. On Windows, the helper executable has an `.exe` suffix. A direct service probe excludes UI work and does not replace native interface verification.

Run `npm run check` before committing. It runs ESLint, Rust Clippy, Prettier, rustfmt, TypeScript checks, frontend tests, Rust tests, and frontend/native build checks. Use `npm run format` to format source files and `npm test -- src/lib/desktop.test.ts` to run a specific frontend test file. See [AGENTS.md](./AGENTS.md) for contribution rules.

## Independent Read-only Authorization

ThreadLine uses the **ThreadLine Desktop** GitHub App. Its public client ID is distributed in [src-tauri/github-app.json](./src-tauri/github-app.json); ordinary users do not register an app or configure credentials.

1. Choose **Log in to GitHub** in ThreadLine. The application displays a one-time device code and opens GitHub's official authorization page.
2. Enter the code on GitHub and authorize ThreadLine Desktop. ThreadLine automatically completes sign-in and opens repository selection.
3. Select or enter a public repository, for example `llvm/llvm-project`. Public repositories do not require an app installation.
4. For private repositories, the repository-owning account or organization installs the app once and selects the permitted repositories. **Add private repository access** opens this optional GitHub installation flow. Organization members authorize their own user identity, but do not register separate apps.

The app requests only these repository permissions, all **read-only**: Metadata, Contents, Issues, Pull requests, Checks, and Commit statuses. It requests no account, organization, administration, write, deletion, public-key, or workflow-management permissions. The backend audits the registered app and installation permissions and rejects unexpected or write permissions. Private repository access is checked against the app installation's selected repositories.

Access and rotating refresh tokens are stored in ThreadLine's encrypted vault, partitioned by client ID. XChaCha20-Poly1305 authenticates and encrypts credentials with a fresh nonce for every atomic write. A randomly generated 256-bit key is stored in a separate application-owned file under the vault's `keys/` directory. Encryption, decryption, and key management run entirely in the application; no macOS Keychain or Windows Credential Manager request is made. Users do not create a master password or unlock a vault on every launch. No key is embedded in the executable. Files and directories are restricted to the current user on Unix; Windows relies on the user's local application-data directory permissions. This protects the ciphertext from casual inspection, but a process that can read both files as the same user can decrypt it.

Signing in once restores the account and selected repository on subsequent launches. Access tokens expire after eight hours and renew automatically using rotating refresh tokens, without a client secret. Revoked authorization or an expired refresh token requires sign-in again; a temporary network or system-store failure does not erase saved credentials. **Log out of ThreadLine** removes both the current encrypted credential file and its local key file, so reopening does not sign in again. GitHub account settings can revoke the server-side authorization.

Tokens and encryption keys never enter React, SQLite, browser storage, environment variables, logs, or GitHub CLI configuration. No private key or client secret is embedded in the desktop app. Missing or damaged key files return an explicit error without replacing saved credentials. There is no plaintext or production in-memory fallback. Version 2 vaults used OS-protected keys: they are preserved without accessing the old system entry, and upgrading requires signing in once to create the software-owned version 3 vault. The old encrypted file is never reused as a fallback.

Maintainers register and configure the shared GitHub App once. Fork maintainers can change the public configuration or override `THREADLINE_GITHUB_CLIENT_ID` and `THREADLINE_GITHUB_APP_SLUG` at launch. See [GitHub App setup](./docs/github-app-setup.md) for registration and permission boundaries.

## GitHub Notifications Limitation

GitHub's Notifications REST API does not accept GitHub App user or installation tokens. ThreadLine instead builds a unified Inbox from read-only searches for related PRs and Issues in the selected repository (created, assigned, mentioned, commented, reviewed, or requested for review). One row represents the latest revision of a thread, sorted newest first; it is not a complete event log or the GitHub Notifications feed. New revisions become unread, including changes to comments, review state, commits, and checks returned by the search. Search indexing and the configured polling interval determine detection latency; the app must remain running. Failed or incomplete synchronization preserves the visible error rather than implying no updates. See [GitHub's notification API documentation](https://docs.github.com/en/rest/activity/notifications).

## Current Scope

The interface includes authored pull requests, review participation, issues, pull request details, settings, onboarding, snoozed items, and synchronization error states. Search, filters, record previews, local read markers, themes, density changes, and snooze scheduling are interactive.

Primary views share a compact page header, control sizing, spacing, and dark/light palette. Lists retain explicit lifecycle/review/check/merge labels while emphasizing the primary status; summaries clean Markdown without changing the original discussion. Regular windows retain sidebar labels, while narrower windows use named icon navigation. Issue reading uses a larger dialog with independently scrolling content and persistent header/actions. Settings use standard switches, bounded form widths, and equal-width theme cards.

File differences show independent old/new line numbers and added/removed backgrounds. Long lines support horizontal scrolling, keyboard left/right navigation, and optional wrapping. Large patches render 400 rows at a time with a reveal-more control. Checks show separate failed/running/passed/other totals and put failures first; missing or unknown results are not treated as passing.

The authored list starts without a selected PR or permanent preview. Single-click a row to open **PR 预览** using its already-synchronized summary; close it with its close button or Escape. The panel toggle can reopen the explicitly selected PR. Changing search, state, or attention filters clears the selection instead of previewing an unrelated first match. Wide windows (at least 1400 CSS pixels) use an inline right column; smaller windows use a closable floating panel. Double-click, Enter, or **打开完整详情** opens full details.

Lifecycle icons now use green for open PRs, gray/dashed branches for drafts, purple joining branches for merged PRs, and red crossed branches for closed/unmerged PRs. The shapes and accessible names also distinguish them without color. The authored list no longer shows letter-avatar placeholders on the right; explicit review requests appear as named text next to the next action. A recent reviewer is not substituted for an active request, and completed PRs do not show pending-reviewer metadata.

PR state labels use separate dimensions rather than one combined status:

| Dimension        | Meaning                                                                                                                                                                                                                                               |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lifecycle        | Open, draft, merged, or closed without merging. Completed PRs do not remain in action-required groups.                                                                                                                                                |
| Review           | GitHub's aggregate formal-review decision: required, approved, changes requested, or unavailable. Approval does not mean the PR has merged.                                                                                                           |
| Checks           | Current HEAD check rollup: passing, failed, pending, or no record. No record does not mean success.                                                                                                                                                   |
| Merge conditions | GitHub-reported conflicts, blocked rules, behind-base state, clean conditions, or unknown state. A blocked status does not establish its specific cause.                                                                                              |
| My review        | The current account's formal conclusion, shown separately from the aggregate result, including whether it targets the current or an older commit. New commits invite inspection without claiming that GitHub has automatically dismissed an approval. |

The lists and detail page show labeled text badges plus a next-action sentence; brief explanations are available by hovering over each badge. Drafts, completed PRs, new review requests, post-review commits, and waiting for author changes are separate review groups/filters. Unknown or truncated review history is explicitly disclosed. See [GitHub's merge-state definitions](https://docs.github.com/en/graphql/reference/pulls#mergestatestatus).

Authored pulls include states, review decisions, and HEAD check summaries. Reviewed pulls combine formal reviews, requested reviews, and comment participation, deduplicate results, and compare review commits with the current HEAD. Issues include records involving the current account. Details load the description and metadata first through GraphQL. Discussion history, file patches, and checks load independently when their tabs are selected, each with its own progress, failure, and retry state. Their expected HEAD is checked before results are displayed. Full history remains available through progressive rendering: recent discussion entries appear first, and older entries can be revealed; file patches render only when expanded. Content renders sanitized GitHub-flavored Markdown with foldable details, code blocks, tables, and task lists. Images are shown as links instead of automatically loading remote content.

The application performs only read operations on collaboration data. Read markers and snoozes are local, scoped by account, repository, and record revision. Themes, density, refresh settings, and snooze deadlines persist locally. The Inbox badge always reflects local unread revisions. New updates can produce an in-app toast and optional native desktop notifications; native notifications require permission, requested only when the desktop notification switch is enabled. The first import establishes a persisted baseline without notifying for historical records. Reminder type preferences and quiet hours affect popups, not Inbox membership or unread counts. Manual refresh mode and an exited app do not poll. Notification delivery errors are visible, and the app never marks GitHub notifications as read.

REST and GraphQL requests follow pagination. GitHub search has a 1,000-result ceiling, which produces an explicit error when exceeded. Review summaries include the latest 100 reviews and flag truncated history where a personal review cannot be established. The detail page reads full paginated review history. GitHub may omit binary or large patches and limits PR file lists to 3,000 files; missing content is disclosed with a link to GitHub.

Successful API responses are cached in SQLite by independent app client ID, account, repository, operation, record number, and expected HEAD where applicable. Startup restores the cached session and responses after checking the local credential identity, then verifies the session in the background. Freshness windows are the configured list refresh interval (five minutes in manual mode), two minutes for overview/discussion, 30 seconds for checks, ten minutes for files, 15 minutes for the current UTC profile year, and 24 hours for past years. A HEAD alone does not make a file comparison immutable. Cached responses older than a known record update or carrying an outdated PR HEAD refresh even within these windows. Fresh cached responses avoid network reads; expired responses remain visible with their original timestamps while refreshing. Manual refresh and retry request the network. Offline errors retain cached content with an error banner; authentication, application-permission, repository-access, and missing-record failures clear the affected cache and visible data. Cached hydration never establishes notification baselines or emits notifications; those require a complete successful live list refresh.

The persistent cache is bounded to 128 entries and 32 MiB, with entries older than 30 days evicted. Database schema version 2 migrates existing caches and indexes eviction metadata. Old GitHub CLI cache and repository selection are not reused. Already-read detail content also uses a bounded memory cache within the current account/repository session under the same freshness policy; access denial or a changed HEAD removes invalid cached content.

The HTTP client reuses connections. Live account, application, and repository checks run concurrently; the locked local credential is rechecked after the data read to catch logout or account replacement without a redundant second remote identity request. Independent review searches and PR detail endpoints run concurrently, while pagination and final HEAD validation remain ordered. Completed workspace categories render immediately, and overlapping refresh triggers share the current synchronization; a manual refresh queued during cache hydration subsequently forces network reads. Repository changes discard pending results. Reconfirming the same selected repository preserves its loaded or pending workspace.

Tests use isolated fixtures and injected network, clock, and credential interfaces. Production views have no sample-data fallback. Native UI verification and its remaining limits are recorded in [docs/ui-verification.md](./docs/ui-verification.md).

The database is stored in Tauri's application data directory as `io.chenmiaoi.threadline/threadline.db`, typically under `%APPDATA%` on Windows and `~/Library/Application Support/` on macOS. Settings shows the actual path. The encrypted vault is stored under the platform local-data directory at `io.chenmiaoi.threadline/vault/<client-id>.session.v3.vault`, with its key at `io.chenmiaoi.threadline/vault/keys/<client-id>.v3.key` (on macOS, `~/Library/Application Support/`). Vault transaction lock files contain no credentials. Do not commit databases or credentials to Git.

## Project Structure

```text
src/                     React interface and desktop command bridge
public/assets/figma/     Local design assets
src-tauri/src/           Rust HTTPS, independent authorization, secure storage, and SQLite
src-tauri/migrations/    Versioned database migrations
src-tauri/capabilities/  Window permissions
```

## Documentation Language

Documentation is written in English by default. Chinese translations must use a `-zh` or `-cn` filename suffix, such as `README-zh.md` or `setup-cn.md`.

## Continuous Integration

GitHub Actions runs the [CI workflow](./.github/workflows/ci.yml) on pushes, pull requests, and manual dispatches. Windows and macOS jobs install dependencies with `npm ci`, run `npm run check`, and build unsigned debug installers using `npm run build:desktop:installer`. The Windows artifact contains an NSIS installer; the macOS artifact contains a DMG. Artifacts include the license and are retained for seven days. Production releases require a separate release build and signing.

CI uses Node.js 24.22.1 and Rust 1.98.1 with Clippy and rustfmt. Actions are pinned to commit hashes, permissions are read-only, and newer runs cancel superseded runs for the same branch or pull request.

## License

ThreadLine is licensed under the GNU General Public License version 3.0 only (`GPL-3.0-only`). See [LICENSE](./LICENSE) for the full license text.

The bundled Inter and Noto Sans SC fonts retain their SIL Open Font License notices in [public/licenses/inter-OFL.txt](./public/licenses/inter-OFL.txt) and [public/licenses/noto-sans-sc-OFL.txt](./public/licenses/noto-sans-sc-OFL.txt).
