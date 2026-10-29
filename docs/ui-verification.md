# UI Verification

## Current Software-owned Storage and Performance

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
