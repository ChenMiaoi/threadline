# Testing

[Documentation](README.md) · [Development](development.md) · [Architecture](architecture.md)

Use automated tests for reproducible behavior and failures, then verify the native interactions affected by a change. A successful browser check does not establish native platform behavior.

## Automated gates

Run from the repository root after `npm ci`:

```sh
npm run check
```

The gate runs ESLint and Clippy, Prettier and rustfmt checks, TypeScript checks, frontend tests, Rust tests, the frontend production build, an all-features Rust check, and a debug native build without bundling. It requires the [native build prerequisites](development.md#prerequisites). It does not perform interactive UI tests, sign in to GitHub, or certify an installer.

Use focused checks while editing:

```sh
npm test -- src/lib/useGitHub.test.ts
npm test -- src/features/pulls/AuthoredPage.test.tsx
npm run test:rust
cargo test --locked --manifest-path src-tauri/Cargo.toml --all-features github_workspace
npm run typecheck
npm run format:check
```

For documentation-only changes, check Markdown formatting, links, commands, and referenced paths. Do not substitute a formatter for behavior tests on code changes. Before committing, follow the repository's [verification rules](../AGENTS.md).

## Regression coverage to preserve

| Area                    | Important observable behavior                                                                                                                   | Representative tests                                                                                                                                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authorization           | Normal first launch, expired login, device polling/cancellation, safe token rotation, no shared CLI credentials                                 | [`useGitHub.test.ts`](../src/lib/useGitHub.test.ts), [`github_auth.rs`](../src-tauri/src/github_auth.rs)                                                                                                                  |
| Credentials             | Restart restoration, tampering/key loss, foreign identities, atomic writes, legacy preservation, logout                                         | [`github_credentials.rs`](../src-tauri/src/github_credentials.rs)                                                                                                                                                         |
| Cache and access        | Local reads make no HTTP requests; account/repo/HEAD isolation; denied access and changed HEAD invalidate disk; late responses cannot republish | [`github_workspace.rs`](../src-tauri/src/github_workspace.rs), [`useGitHubResource.test.ts`](../src/lib/useGitHubResource.test.ts)                                                                                        |
| Persistence             | Database reopen/migration, cache metadata, entry/size/age bounds, saved preferences                                                             | [`db.rs`](../src-tauri/src/db.rs), [`workspace-storage.test.ts`](../src/lib/workspace-storage.test.ts)                                                                                                                    |
| Navigation and recovery | Accessible menu/dialog dismissal, focus restoration, PR opening, one clear-filter action, safe logout cancellation                              | [`WorkspaceShell.test.tsx`](../src/components/WorkspaceShell.test.tsx), [`AuthoredPage.test.tsx`](../src/features/pulls/AuthoredPage.test.tsx), [`SettingsPage.test.tsx`](../src/features/settings/SettingsPage.test.tsx) |
| Data and rendering      | PR lifecycle vs review/check state, issue/thread revisions, profile pagination/UTC dates, Markdown and diff fallback                            | [`src/core`](../src/core/), [`src/features`](../src/features/)                                                                                                                                                            |
| Preview boundary        | Allowed loopback origin/headers, restricted commands, bridge shutdown and malformed responses                                                   | [`github-preview.test.ts`](../dev/github-preview.test.ts)                                                                                                                                                                 |

Use deferred requests or explicit synchronization to test concurrency rather than elapsed-time assertions. Mocked transport tests establish error and ordering behavior, not real network latency or GitHub availability.

## Native verification matrix

Build with `npm run build:desktop:installer`, quit the previous process, and open the newly built app. Record the platform, build command, window/web-area dimensions, and affected scenarios. Keep sensitive repository content out of shared evidence.

| Scenario                       | Check                                                                                                                                                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Normal and minimum native size | Test at a normal window size and 900px width, with at least the configured 680px window height; record the actual web area separately. Repeat affected layouts in dark/light and comfortable/compact modes. |
| Lists and navigation           | Search by title/number, switch filters, verify empty recovery, open a PR with a real double-click at 900px and just below 1400px, then use Enter and the explicit detail action.                            |
| Menu and dialogs               | Escape closes and restores focus. An outside menu click closes without activating the underlying page. Logout starts on Cancel; Cancel, Escape, and close preserve the account.                             |
| PR and Issue readers           | Verify independent sections, retry, fixed reader controls, horizontal diff scrolling, wrapping, syntax fallback, and return to the previous search/scroll position.                                         |
| Persistence                    | Restart with an existing login; confirm repository, preferences, and previously read data restore. Distinguish cached content from a completed live refresh.                                                |
| Recovery                       | Inject a transient request failure, keep old content visible, confirm actionable text, and actually click retry. Verify successful reconnection separately.                                                 |
| Profile and snoozes            | Check calendar boundaries/keyboard movement at minimum width, selected snooze view semantics, restore selection, and local state persistence.                                                               |
| Platform chrome                | On macOS test traffic lights, titlebar dragging, minimize and full screen. On Windows test the custom controls and native resize behavior.                                                                  |

Browser checks at 360px are supplemental responsive tests; the native minimum width is 900px. DOM/ARIA assertions and keyboard checks do not establish screen-reader speech. A native macOS pass does not establish Windows behavior.

Use mocks or a disposable account for destructive local-state changes and permission revocation. Real logout, private repository access, organization policy, physical offline/reconnect, desktop notification delivery, and accessibility technology require dedicated checks; do not infer them from a mocked test or an unrelated smoke run.

## Timing and CI evidence

Settings diagnostics report client wait, React commit time, and backend spans. Client wait includes backend work; do not add the two as independent costs. These values exclude screen refresh and observation-tool overhead. The browser bridge queue is also distinct from native execution.

An optional local cache benchmark is excluded from normal test runs:

```sh
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib db::tests::benchmark_near_capacity_cache_writes -- --ignored --exact --nocapture
```

Use comparable datasets and repeated measurements for performance claims. A single live request, a test duration, or an accessibility observation interval is not a latency distribution.

The [CI workflow](../.github/workflows/ci.yml) configures macOS and Windows checks and debug-installer artifacts. Check the actual run and artifact for the commit being assessed; workflow configuration alone does not establish a passing build, native interaction coverage, signing, or notarization.
