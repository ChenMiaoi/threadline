# Product maturity audit

Date: 2026-10-30

ThreadLine has a credible read-only GitHub reader foundation, but is not yet ready to be treated as a polished, generally distributed desktop product. The highest priorities are recoverable failures, predictable navigation, large-repository handling, and a real release and update pipeline.

This audit covers application navigation, settings, PR and activity readers, synchronization, notifications, persistence, packaging, and existing tests. Source inspection and browser-preview interaction are distinguished from performance hypotheses below. The browser preview used an existing session; no new authorization or GitHub writes were performed. Windows installation, native notification delivery, signed upgrades, screen-reader output, and long-running resource consumption still need platform testing.

## Findings and acceptance criteria

P1 means required before general distribution or material to a core workflow. P2 means a usability or efficiency improvement. These priorities do not imply a confirmed security incident.

| Priority | Finding and evidence                                                                                                                                                                                                                 | Required result                                                                                                                                                                                                                      | Status                                                |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| P1       | No production update path. `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `.github/workflows/ci.yml` contain no updater integration or release workflow; CI produces debug installers.                                     | Show the installed version and channel; distinguish checking, current, available, failed, downloading, and ready-to-restart states. Validate a signed upgrade from a previous installed version on both supported operating systems. | Open                                                  |
| P1       | Large repositories can hit a hard stop. `src-tauri/src/github.rs` rejects search results above 1,000 with `GH_SEARCH_LIMIT`; the list UI offers no server-side date-range narrowing. Local text filtering cannot repair this.        | Offer a recent-history range and explicit server-side scope controls. Never represent an incomplete result as a complete total. Verify a repository with more than 1,000 matching records.                                           | Open                                                  |
| P1       | Local storage failure has no in-place recovery. `src/lib/useWorkspace.ts` blocks subsequent updates while `error` is set; `src/App.tsx` asks users to reopen the workspace.                                                          | Preserve unsaved state, visibly disable unavailable operations, and provide a retry that saves the latest state without overwriting it with older disk data. Test load failure, write failure, and recovery.                         | Open                                                  |
| P2       | PR detail navigation is unnecessarily indirect. `AuthoredPage.tsx` uses click for preview and double-click or Enter for details. A preview action exists, so the row is not actually inert, but the distinction is hard to discover. | A visible, keyboard-accessible single-click detail action for each PR, with no nested buttons.                                                                                                                                       | Added and regression-tested                           |
| P2       | “Next step” text looks like an unfulfilled action. The text originates from `PullStatus.nextAction` and is rendered without an action handler in authored, activity, and detail views.                                               | Separate advice from actual controls. Longer-term, route specific actions to checks, discussion, or GitHub as appropriate.                                                                                                           | Relabeled as advice; contextual actions remain open   |
| P2       | Settings explain obvious labels and repeat identity, authorization, and appearance details. The language row displays one fixed language without offering a setting.                                                                 | Keep short explanations only for consequences or non-obvious behavior. Remove unavailable choices and duplicate identity information.                                                                                                | Initial cleanup applied                               |
| P2       | Connection checks and notification permission requests lack consistent disabled feedback. `SettingsPage.tsx` allowed connection checks while connecting; notification requests had a guard but no disabled switch.                   | Prevent repeated actions while a request is pending and expose an observable waiting state. Also add explicit connection-check success feedback in a later pass.                                                                     | Pending controls fixed; success feedback remains open |
| P2       | Quiet hours have no obvious off switch. `core/inbox.ts` treats equal start/end times as disabled, but settings does not explain or expose this convention.                                                                           | Provide an explicit enable/disable control, retain the selected interval, and test overnight ranges and start/end boundaries.                                                                                                        | Open                                                  |
| P2       | Background polling always refreshes four list categories on a fixed interval. `useGitHub.ts` does not use connectivity, window visibility, or a rate-limit cooldown to schedule polling.                                             | Suppress offline work, use backoff after repeated failures, and choose a documented background cadence that preserves notification delivery. Do not simply stop hidden-window polling.                                               | Confirmed scheduling behavior; cost needs measurement |
| P2       | Authored and activity lists render all matching rows. `AuthoredPage.tsx` and `ActivityPage.tsx` map the complete filtered collections.                                                                                               | Benchmark 100 and 1,000 records before choosing incremental rendering or virtualization. Preserve keyboard focus, selection, and restored scroll position.                                                                           | Performance risk, not a measured slowdown             |
| P2       | Search data is heavy and overlaps across categories. `github-search.graphql` includes bodies and up to 100 reviews per PR, while synchronization requests authored, activity, review, and issue lists.                               | Measure payload bytes, API request count, and latency; reduce redundant fields only while preserving review and unread semantics.                                                                                                    | Performance hypothesis                                |
| P2       | Onboarding repeats permission and credential details before the primary action. `GitHubLogin.tsx` and `GitHubConnection.tsx` expose lengthy explanations.                                                                            | Keep the purpose and private-repository prerequisite near login; move detailed storage and permission information into a disclosure. Preserve error recovery instructions.                                                           | Open                                                  |
| P2       | Status density remains high. Every compact PR status group still renders lifecycle, review, checks, and merge dimensions.                                                                                                            | Lead with the actionable blocker in lists; retain all dimensions in details. Verify that absence of a badge is never confused with success.                                                                                          | Open design improvement                               |
| P2       | Desktop lifecycle expectations are incomplete. No tray or background-service setup appears in `src-tauri/src/lib.rs`; notification delivery depends on a running, refreshing app.                                                    | Decide and communicate close/quit behavior. If background reminders become a promise, implement and test the corresponding lifecycle.                                                                                                | Product decision pending                              |

## Changes included in this audit

- Added a direct detail button beside each authored PR while preserving preview and keyboard behavior.
- Changed action-sounding “next step” prefixes to advice in PR and activity views; authored advice also has a full-text tooltip.
- Removed settings category subtitles, duplicate account identity and storage prose, obvious control descriptions, and the fixed-language pseudo-setting.
- Retained explanations of private-repository access, read-only scope, notifications, and failure behavior.
- Disabled connection checks during connection/authorization and the desktop notification switch during permission requests.
- Added regression coverage for direct detail navigation and pending connection checks.

These changes are an initial repair pass, not completion of every finding.

## Existing strengths to preserve

- Core data transformations are separated from host adapters.
- Cache access is revoked for authorization failures, rather than serving inaccessible private data.
- Detail requests are deduplicated and protected against stale account, repository, and HEAD results.
- Discussion, files, checks, Markdown, and syntax highlighting load independently or on demand.
- The in-memory detail response cache is already capped at 24 entries; diagnostic samples are also capped. Do not diagnose it as an unbounded response cache.
- Network reads have timeouts and limited retries; oversized responses and unsafe pagination links are rejected.
- Local read and snooze actions do not mutate GitHub state.
- Dialog focus, tabs, authorization cancellation, stale data, and diff behavior already have regression tests.

## Release and update implementation plan

1. Establish production versioning and release artifacts for macOS and Windows, separate from short-lived debug CI artifacts. Keep package, Rust, and Tauri versions consistent.
2. Integrate the Tauri updater through a host adapter. Configure the update endpoint and verification public key; keep the signing private key in release secrets. Produce signed update artifacts and platform/architecture metadata. Tauri requires signature verification; an update button alone is insufficient. See the [official updater guide](https://v2.tauri.app/plugin/updater/).
3. Add an About and Updates section showing installed version, update status, release notes, manual checking, and the last successful check. A missing endpoint must not be reported as “up to date.”
4. Check automatically at a bounded cadence, with manual retry. Download and install with progress and actionable errors. Let users choose when to restart; finish pending persistence first.
5. Verify real previous-version upgrades, offline checking, malformed manifests, signature rejection, unsupported architecture, interrupted download, repeated clicks, and restart recovery. Treat operating-system application signing/notarization separately from updater artifact signatures.

No production keys, release endpoints, updater configuration, or automatic installation were created during this audit.

## Performance acceptance plan

Use a production build on named hardware. Record median and p95 over repeated runs; development hot reload and browser automation time are not product latency.

| Scenario                      | Measurements                                       | Proposed target or invariant                                                                                    |
| ----------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Cached startup and navigation | Time to visible usable cached content              | Provisional target: p95 below 500 ms after the shell is ready                                                   |
| Large lists                   | 100/1,000 rows, input-to-paint, scroll, long tasks | Provisional target: p95 filter response below 100 ms; no recurring long tasks during scrolling                  |
| PR details                    | Cold/warm overview, discussion, files, checks      | Cached content remains usable while refreshing; inactive sections do not trigger unnecessary requests           |
| Background operation          | Requests, bytes, CPU and memory over 30 minutes    | No overlapping duplicate refreshes; bounded retry traffic; notifications still arrive at the documented cadence |
| Extended reading              | Hundreds of detail visits and HEAD changes         | Memory reaches a plateau; record byte usage as well as cache entry count                                        |
| Distribution size             | JS/CSS/font sizes and installed size               | Track changes against a baseline; reduce fonts only after checking Chinese glyph coverage                       |

The inspected build produced approximately 5.7 MiB of frontend assets, including bundled fonts. This is disk output, not startup download size or a memory measurement. Existing timing samples measure request waiting and React commit timing, not actual screen paint.

## Verification

The initial full `npm run check` completed successfully: lint, formatting, TypeScript, frontend tests, Rust tests, frontend build, Rust checks, and the macOS desktop debug build. The Rust cache benchmark is intentionally ignored by the normal suite and was not run; Windows behavior requires its own environment.

Focused tests passed for authored PRs, settings, activity, and PR details after the initial UI changes. Final full-suite results are recorded in the accompanying task response.

Browser-preview checks confirmed account settings, appearance choices, the repository-backed PR list at the configured 900 × 680 desktop minimum, and direct navigation from a newly added detail button into a real PR detail view. This does not establish native updater, installer, or notification correctness.
