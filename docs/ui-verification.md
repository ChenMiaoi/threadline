# UI Verification

## Current Authorization and Storage

ThreadLine now uses its own read-only GitHub App and an application-owned encrypted credential vault with an OS-protected random key. Historical checks using shared GitHub CLI credentials or system keychain storage do not validate the current split key/ciphertext implementation.

On October 29, 2026, a GPT-6.1 Terra xhigh subagent exercised the actual macOS Tauri app through Computer Use with the independent GitHub App:

- An initially empty ThreadLine credential store showed the logged-out screen even though GitHub CLI was authenticated.
- Device authorization completed on GitHub's official page for ThreadLine Desktop. The app completed login automatically and opened repository selection.
- `llvm/llvm-project` loaded without installing the app on that repository: 11 open authored PRs, 20 review entries, and 13 issues (nine open and four closed) were observed for the signed-in account.
- PR #236597 loaded its discussion, 16 changed files, and ten checks. **View on GitHub** opened the matching GitHub URL in Chrome.
- The Inbox displayed the explicit GitHub App token limitation.
- Confirming the already-selected LLVM repository preserved the loaded workspace after fixing a request-invalidation bug. A regression test covers this behavior.
- Logout, repeat login, and restart restoration were exercised using the previous app-owned keychain entry. Those persistence results must be repeated for the current encrypted-file and OS-protected-key implementation.

The registered public GitHub App has only repository Metadata, Contents, Issues, Pull requests, Checks, and Commit statuses permissions, all read-only. No repository installation, signing key, client secret, or broad GitHub CLI authorization was created for public-repository testing. Private installation was not submitted or verified.

## Encrypted Vault Verification

`npm run check` passed for this implementation: lint, formatting, types, 98 frontend tests, 27 Rust tests, and frontend/native builds.

The earlier master-password experiment was removed: normal launches must restore the saved login automatically. Current automated tests exercise restart restoration without a password, credential and key deletion on logout, unique ciphertext, tampering, foreign client IDs, missing/unavailable OS keys, file permissions, and cross-process locking. Key access failures do not erase or overwrite saved credentials, and failed key creation cannot fall back to plaintext or process memory. Frontend tests verify restore on remount and no restore after explicit logout.

The development preview uses the same Rust services through a persistent helper. Its loopback/origin boundary and command schema are tested; obsolete password/unlock commands are rejected. Credentials and encryption keys are never returned to the frontend.

The rebuilt native app was tested with Computer Use by the Terra xhigh subagent. First sign-in through ThreadLine Desktop completed without a master-password form or password prompt, and the repository picker opened automatically. Selecting `llvm/llvm-project` loaded 11 authored PRs, 20 review entries, and 13 issues. The application created its new encrypted session file. Using the same binary without rebuilding, Cmd-Q followed by reopening restored the account, LLVM repository, and the same live collaboration views without a password or another GitHub authorization. Explicit logout immediately cleared the account, repository, and counts; quitting and reopening afterward stayed signed out. These are current native Computer Use results, separate from the earlier system-token and master-password experiments. The macOS DMG checksum passed `hdiutil verify`, and its packaged executable matched the checked native build.

## macOS Window Behavior

macOS uses a visible native titlebar and system traffic lights. The web header omits custom drag markers and Windows-style window controls. The default window is centered at 1100 × 740 with a 900 × 680 minimum. The Apple Silicon application and DMG have been built locally; unsigned debug bundles are for development, not notarized releases.

Native minimize/restore, full-screen/exit, titlebar double-click, and opening external GitHub links were exercised. Native menu actions produced real window movement. Controlled synthetic titlebar drags did not produce attributable movement through Computer Use. The user subsequently dragged the native titlebar and confirmed that the window moved on October 29, 2026. **Native titlebar dragging is manually verified by the user**, not claimed as an automated drag result. ScreenCaptureKit intermittently returned `-3811`, `-3812`, or distorted multi-display frames. Temporary pointer/window-event probes were removed from source.

The new macOS CI job has not run remotely. Windows was not rerun on this Mac. Physical network disconnection/reconnection was not exercised; injected failure tests cover request errors and recovery. A fresh offline launch requires a live identity/access check before persisted account-scoped records can be served.

## Earlier Interface Audit

An earlier browser audit covered navigation, repository selection, filters, search, PR discussions and file/check views, settings, appearance, narrow layouts, local read markers, and snoozing. Browser widths included 1440, 900, 648, and 360 pixels. Those checks used the earlier shared CLI integration and establish interface history only. Current Inbox capability and authentication behavior are covered separately above.
