# UI Verification

## Current Authorization and Storage

ThreadLine now uses its own read-only GitHub App and an application-owned encrypted credential vault. Historical checks using shared GitHub CLI credentials or system keychain storage do not validate the current vault implementation.

On October 29, 2026, a GPT-6.1 Terra xhigh subagent exercised the actual macOS Tauri app through Computer Use with the independent GitHub App:

- An initially empty ThreadLine credential store showed the logged-out screen even though GitHub CLI was authenticated.
- Device authorization completed on GitHub's official page for ThreadLine Desktop. The app completed login automatically and opened repository selection.
- `llvm/llvm-project` loaded without installing the app on that repository: 11 open authored PRs, 20 review entries, and 13 issues (nine open and four closed) were observed for the signed-in account.
- PR #236597 loaded its discussion, 16 changed files, and ten checks. **View on GitHub** opened the matching GitHub URL in Chrome.
- The Inbox displayed the explicit GitHub App token limitation.
- Confirming the already-selected LLVM repository preserved the loaded workspace after fixing a request-invalidation bug. A regression test covers this behavior.
- Logout, repeat login, and restart restoration were exercised using the previous app-owned keychain entry. Those persistence results are superseded by the master-password vault and must be repeated for it.

The registered public GitHub App has only repository Metadata, Contents, Issues, Pull requests, Checks, and Commit statuses permissions, all read-only. No repository installation, signing key, client secret, or broad GitHub CLI authorization was created for public-repository testing. Private installation was not submitted or verified.

## Encrypted Vault Verification

`npm run check` passed after the vault migration: ESLint, Clippy, Prettier, rustfmt, TypeScript, 101 frontend tests, 26 Rust tests, and frontend/native build checks. The obsolete live test that depended on automatic system-credential access was removed; live data is verified through the user-unlocked native app instead.

Automated tests exercise creation, authenticated encryption, unique ciphertext on repeated writes, wrong passwords, corruption/tampering, lock/unlock, reopening through a fresh store, credential clearing, client-ID isolation, restrictive Unix file permissions, and cross-process transaction exclusion. The serialized vault is checked for absence of plaintext access tokens, refresh tokens, and the test master password. Frontend tests cover masked matching fields, locked-login prevention, failed unlock, clearing password inputs, locking, and clearing the visible workspace.

The development preview uses one persistent Rust helper so unlocking and subsequent API requests share the same in-memory vault key. Its loopback/origin boundary and command schema are tested. Credentials are never returned to the frontend; the master password crosses only the local command boundary for key derivation.

Actual vault creation requires the user to enter a master password in the native app. Current native first-login and restart-unlock results will be recorded after that step; automated coverage is not claimed as completed native interaction.

## macOS Window Behavior

macOS uses a visible native titlebar and system traffic lights. The web header omits custom drag markers and Windows-style window controls. The default window is centered at 1100 × 740 with a 900 × 680 minimum. The Apple Silicon application and DMG have been built locally; unsigned debug bundles are for development, not notarized releases.

Native minimize/restore, full-screen/exit, titlebar double-click, and opening external GitHub links were exercised. Native menu actions produced real window movement. Controlled synthetic titlebar drags did not produce attributable movement, so **titlebar dragging remains unverified**. ScreenCaptureKit intermittently returned `-3811`, `-3812`, or distorted multi-display frames. Temporary pointer/window-event probes were removed from source.

The new macOS CI job has not run remotely. Windows was not rerun on this Mac. Physical network disconnection/reconnection was not exercised; injected failure tests cover request errors and recovery. A fresh offline launch requires a live identity/access check before persisted account-scoped records can be served.

## Earlier Interface Audit

An earlier browser audit covered navigation, repository selection, filters, search, PR discussions and file/check views, settings, appearance, narrow layouts, local read markers, and snoozing. Browser widths included 1440, 900, 648, and 360 pixels. Those checks used the earlier shared CLI integration and establish interface history only. Current Inbox capability and authentication behavior are covered separately above.
