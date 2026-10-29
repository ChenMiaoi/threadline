# UI Verification

## Staged Detail Loading and UI Follow-up

The next iteration added per-operation timing with `Instant` around credential access, live access checks, data reads, final session recheck, and cache writes. Individual HTTP request spans include transport, response reading, and JSON decoding. The desktop interface also records client waiting time and the interval from receiving data to React's layout commit; these are different intervals and should not be added as independent network costs. Screen refresh, later lazy/Suspense work, and Computer Use observation overhead are not measured by the commit value.

Two direct Rust-service baseline probes, using the current account and public LLVM repository, measured the previous aggregate detail path before this iteration's changes:

| Stage                    | PR #229328 | PR #230927 |
| ------------------------ | ---------: | ---------: |
| Local credential read    |     0.4 ms |     0.6 ms |
| Initial account identity |     320 ms |     412 ms |
| App audit                |     301 ms |     373 ms |
| Repository access        |     461 ms |     601 ms |
| Aggregate detail data    |   3,084 ms |   3,606 ms |
| Second remote identity   |     323 ms |     684 ms |
| SQLite write             |      13 ms |      15 ms |
| Total                    |   4,506 ms |   5,696 ms |

The two REST pull metadata reads alone cost about 1.8–2.0 seconds along the critical path. The update uses a standalone GraphQL overview and a small HEAD query for section consistency, runs independent access checks concurrently, and replaces the redundant second remote identity request with a locked local credential check. Live identity, app, and repository validation still gate new data and persisted-cache reads. Tests cover logout and account replacement during a data request, and denial while private cached data exists.

Direct probes after the change returned these independently requested sections:

| Operation                  | PR #229328 | PR #230927 |
| -------------------------- | ---------: | ---------: |
| Overview                   |   2,040 ms |   1,906 ms |
| Discussion, after overview |   2,050 ms |   2,186 ms |
| Files, when selected       |   1,824 ms |   2,062 ms |
| Checks, when selected      |   1,863 ms |   2,044 ms |

Each probe used a newly created HTTP client process and an in-memory SQLite database. These are individual samples affected by live GitHub/network conditions, not percentiles or a controlled speedup ratio. First useful content is the overview; a complete first discussion takes the overview plus its discussion request. Loading all tabs is deliberately different from the old aggregate request, so the overview duration must not be represented as full-detail completion.

UI changes include explicit back/refresh controls, independent tab progress/errors/retry, preserved list search and scroll position, Enter to open a selected PR, always-visible activity search, scoped memory reuse with live revalidation, memoized/preloaded Markdown, recent discussion batches, and file patches mounted only when expanded. Previously hidden search constraints, misleading first-row selection styling, missing Issue retry controls, and oversized detail sidebars were corrected. Settings exposes the recent diagnostic samples for native verification. A regression test prevents manual refresh from being mislabeled as initial cached-render time.

A GPT-6.1 Terra xhigh subagent exercised the rebuilt native app. In-app diagnostic samples from two PRs produced the following measurements (the operation sequence identifies the PR; diagnostic entries intentionally contain no record identifiers):

| Native operation      | Client wait | UI commit |  Backend |
| --------------------- | ----------: | --------: | -------: |
| PR #230927 overview   |    1,297 ms |      4 ms | 1,295 ms |
| PR #230927 discussion |    1,921 ms |     16 ms | 1,913 ms |
| PR #230927 files      |    1,800 ms |      1 ms | 1,796 ms |
| PR #230927 checks     |    1,839 ms |      1 ms | 1,834 ms |
| PR #229328 overview   |    1,165 ms |      3 ms | 1,163 ms |
| PR #229328 files      |    1,468 ms |     <1 ms | 1,464 ms |
| PR #229328 checks     |    1,651 ms |      1 ms | 1,647 ms |

For PR #229328, the overview's backend stages were credentials <1 ms, live access 502 ms, GraphQL data 659 ms, local session recheck 1 ms, and SQLite 1 ms. For PR #230927 on a subsequent revalidation, they were 1, 515, 657, <1, and 1 ms respectively (backend total 1,174 ms). UI work is small compared with network waiting in these samples. An overview and a first discussion are separate sequential operations; for the first row's PR, useful description/metadata appears after about 1.3 seconds and the full discussion after a further 1.9 seconds.

Reopening already-read content showed cached overview, discussion, files, and checks with zero additional network wait before initial display. Observed cached commit samples were 1–22 ms (including 18 ms for discussion and 22 ms for overview on one PR, and 7/8 ms on another). Live revalidation still followed; these numbers do not mean fresh GitHub data can be fetched in milliseconds.

Functional native checks passed for:

- Authored PR states, number search, selection/preview, Enter to open, and the explicit back button. Opening a draft from the bottom of the list showed the detail from the top; returning restored the original draft/scroll position. The search term was preserved.
- Review search (`235313`), attention filtering, and empty filtered results.
- Issue label and number filters (`good first issue` / `229300`), body/comments, last-read timestamp, close, and cached reopen with an update notice.
- PR discussion, file expansion, checks, manual refresh, repeated open, and independent tab loading for PRs #229328 and #230927.
- All four Settings sections, repository picker cancel, the Inbox limitation, and the empty Snoozed page.

Regression found a diagnostic bug: a manual refresh could incorrectly label the component's lifetime as cached-render time. The fix only records an initial cached commit and never records a failed retry using an old response timestamp; both paths have regression tests. A minor empty-state message was also made neutral to the selected filter, and the client metric was renamed to explain remaining wait when an in-flight request is reused. The final rebuilt package was then rechecked after quitting the earlier process and reopening the bundle from its full path. Manual refresh no longer generated an incorrect cached-render sample, the updated empty-filter message appeared, and the metric label was **客户端等待**. Final PR #229328 samples were:

| Final-package operation    | Client wait | UI commit |  Backend |
| -------------------------- | ----------: | --------: | -------: |
| Overview                   |    1,173 ms |      4 ms | 1,171 ms |
| Discussion, after overview |    1,723 ms |     26 ms | 1,715 ms |
| Files                      |    1,372 ms |      2 ms | 1,368 ms |
| Checks                     |    1,606 ms |      1 ms | 1,601 ms |
| Explicit overview refresh  |      971 ms |      2 ms |   969 ms |
| Cached overview on reopen  |        0 ms |      1 ms |        — |

A further Cmd-Q and reopening of this final bundle automatically restored the account, LLVM repository, and 11 open authored PRs without a keychain/master-password prompt. The app was left signed in with the LLVM list available. All native regression findings were resolved and specifically rechecked. Different window widths and deliberate physical network failures were not tested. ScreenCaptureKit temporarily failed during the run; resetting the Computer Use session restored access without changing system permissions.

This iteration passed `npm run check`: 110 frontend tests, 39 Rust tests, lint/format/types, and frontend/native builds. Live private-repository checks, Windows, physical offline transitions, and large-data native rendering have not been exercised. Automated failure/revision/cache tests cover paths that would be unsafe or unreliable to reproduce by revoking the real user's access.

## First Performance Iteration and Software-owned Storage

On October 29, 2026, `npm run check` passed after connection reuse, concurrent review searches and PR detail reads, progressive workspace results, refresh coalescing, and version 3 software-owned credential storage were implemented. This included 100 frontend tests, 33 Rust tests, lint, formatting, type checks, and frontend/native build checks. The debug app and DMG were also rebuilt.

Regression tests hold independent requests until all expected peers have started, verifying actual overlap without using elapsed-time thresholds. They also cover independent list completion, overlapping refresh triggers, late repository/account results, changed PR HEAD, required endpoint failures, optional check failures, local key loss/corruption, restart restoration, and preserved version 2 files. Functional test durations are not network performance measurements.

Version 3 stores its encryption key in a separate application-owned local file and does not access an OS credential entry. Version 2 ciphertext is preserved without reading its system key; upgrading requires signing in once. Local file encryption does not protect against a process that can read both the key and ciphertext as the same user. See [authorization and storage](./github-app-setup.md).

A GPT-6.1 Terra xhigh subagent then exercised the actual rebuilt macOS desktop app through Computer Use:

- The old process was quit and the rebuilt bundle opened. The version 2 storage-upgrade message appeared, confirming the new implementation was running. Signing in through the existing read-only ThreadLine Desktop GitHub App succeeded.
- Selecting `llvm/llvm-project` showed 11 open authored PRs, 20 review entries, and 13 issues (nine open, four closed).
- Issues refreshed without duplicate visible entries. The refresh button was disabled while syncing, and filters remained responsive. Completion was observed after approximately 5.5 seconds, including Computer Use overhead and observation intervals.
- Searching issues for `229300` reduced the authored-issue filter from three records to Issue #229300. Searching PRs for `230927` reduced the list to that PR.
- PR #229328 displayed 24 discussion entries, 13 changed files, an expanded ReleaseNotes patch, and 11 checks (nine passing). Returning to the list and reopening the detail worked. PR #230927 displayed 40 discussion entries, seven files, and 11 checks.
- Three detail-load observations took approximately 5.7, 6.1, and 5.0 seconds. These include Computer Use/tool overhead and observation intervals; they are not precise network timings, percentiles, or a measured before/after speedup. There was no comparable timed baseline for the old build.
- Cmd-Q followed by reopening the same bundle restored the account and LLVM workspace without another authorization. Explicit logout followed by Cmd-Q and reopening stayed signed out, with Settings showing that GitHub was disconnected.
- A final sign-in and repository selection succeeded, leaving the desktop app connected and usable. No system keychain or master-password prompt was observed throughout these checks.

The rebuilt DMG passed `hdiutil verify`; its packaged executable matched the checked native executable by SHA-256. Screenshots were observed through Computer Use, but no screenshot files were exported. Private repositories, Windows native behavior, physical offline recovery, and large-data rendering performance were not exercised. Each operation still performs live identity and permission checks, and persisted data is not served immediately before those checks. Browser-preview queueing was not changed or used as a desktop performance measurement.

## Earlier OS-keyed Authorization and Storage (Version 2)

The earlier version 2 implementation used its own read-only GitHub App and an application-owned encrypted credential vault with an OS-protected random key. Historical checks using shared GitHub CLI credentials or system keychain storage do not validate the current split key/ciphertext implementation.

On October 29, 2026, a GPT-6.1 Terra xhigh subagent exercised the actual macOS Tauri app through Computer Use with the independent GitHub App:

- An initially empty ThreadLine credential store showed the logged-out screen even though GitHub CLI was authenticated.
- Device authorization completed on GitHub's official page for ThreadLine Desktop. The app completed login automatically and opened repository selection.
- `llvm/llvm-project` loaded without installing the app on that repository: 11 open authored PRs, 20 review entries, and 13 issues (nine open and four closed) were observed for the signed-in account.
- PR #236597 loaded its discussion, 16 changed files, and ten checks. **View on GitHub** opened the matching GitHub URL in Chrome.
- The Inbox displayed the explicit GitHub App token limitation.
- Confirming the already-selected LLVM repository preserved the loaded workspace after fixing a request-invalidation bug. A regression test covers this behavior.
- Logout, repeat login, and restart restoration were exercised using the previous app-owned keychain entry. Those persistence results must be repeated for the current encrypted-file and OS-protected-key implementation.

The registered public GitHub App has only repository Metadata, Contents, Issues, Pull requests, Checks, and Commit statuses permissions, all read-only. No repository installation, signing key, client secret, or broad GitHub CLI authorization was created for public-repository testing. Private installation was not submitted or verified.

## Version 2 Encrypted Vault Verification

`npm run check` passed for this implementation: lint, formatting, types, 98 frontend tests, 27 Rust tests, and frontend/native builds.

The earlier master-password experiment was removed: normal launches must restore the saved login automatically. Version 2 automated tests exercised restart restoration without a password, credential and key deletion on logout, unique ciphertext, tampering, foreign client IDs, missing/unavailable OS keys, file permissions, and cross-process locking. Key access failures do not erase or overwrite saved credentials, and failed key creation cannot fall back to plaintext or process memory. Frontend tests verify restore on remount and no restore after explicit logout.

The development preview uses the same Rust services through a persistent helper. Its loopback/origin boundary and command schema are tested; obsolete password/unlock commands are rejected. Credentials and encryption keys are never returned to the frontend.

The rebuilt native app was tested with Computer Use by the Terra xhigh subagent. First sign-in through ThreadLine Desktop completed without a master-password form or password prompt, and the repository picker opened automatically. Selecting `llvm/llvm-project` loaded 11 authored PRs, 20 review entries, and 13 issues. The application created its new encrypted session file. Using the same binary without rebuilding, Cmd-Q followed by reopening restored the account, LLVM repository, and the same live collaboration views without a password or another GitHub authorization. Explicit logout immediately cleared the account, repository, and counts; quitting and reopening afterward stayed signed out. These are historical native Computer Use results for version 2, separate from the earlier system-token and master-password experiments. The macOS DMG checksum passed `hdiutil verify`, and its packaged executable matched the checked native build.

## macOS Window Behavior

macOS uses a visible native titlebar and system traffic lights. The web header omits custom drag markers and Windows-style window controls. The default window is centered at 1100 × 740 with a 900 × 680 minimum. The Apple Silicon application and DMG have been built locally; unsigned debug bundles are for development, not notarized releases.

Native minimize/restore, full-screen/exit, titlebar double-click, and opening external GitHub links were exercised. Native menu actions produced real window movement. Controlled synthetic titlebar drags did not produce attributable movement through Computer Use. The user subsequently dragged the native titlebar and confirmed that the window moved on October 29, 2026. **Native titlebar dragging is manually verified by the user**, not claimed as an automated drag result. ScreenCaptureKit intermittently returned `-3811`, `-3812`, or distorted multi-display frames. Temporary pointer/window-event probes were removed from source.

The new macOS CI job has not run remotely. Windows was not rerun on this Mac. Physical network disconnection/reconnection was not exercised; injected failure tests cover request errors and recovery. A fresh offline launch requires a live identity/access check before persisted account-scoped records can be served.

## Earlier Interface Audit

An earlier browser audit covered navigation, repository selection, filters, search, PR discussions and file/check views, settings, appearance, narrow layouts, local read markers, and snoozing. Browser widths included 1440, 900, 648, and 360 pixels. Those checks used the earlier shared CLI integration and establish interface history only. Current Inbox capability and authentication behavior are covered separately above.
