# Data and security

[Documentation](README.md) · [Architecture](architecture.md) · [GitHub App setup](github-app-setup.md)

ThreadLine reads GitHub data through an independent GitHub App. Local credentials and collaboration data use different storage protections; encrypting the login does not encrypt the workspace cache.

## Authorization

Users authorize the configured GitHub App through GitHub's device flow. The desktop service stores expiring user access and refresh tokens and rotates them under a cross-process credential lock. Tokens are not returned to React, written to SQLite, or imported from GitHub CLI or token environment variables. Temporary token-service failures preserve the local login. If rotation succeeds but a subsequent validation read temporarily fails, the new credentials are retained under the existing account identity; live workspace reads still validate identity and access before publishing data.

The app checks its identity and permitted read-only permission set. Public repository access does not require repository installation in the implemented flow; private repositories require a matching installation and selected repository access. New network reads validate the user, application, and repository before publishing collaboration data.

The Inbox is an application-generated view of relevant PR and Issue activity. It does not mirror GitHub's Notifications inbox: those [REST endpoints do not support GitHub App tokens](https://docs.github.com/en/rest/activity/notifications). Read markers, snoozes, and local reminders do not alter GitHub subscriptions or remote records.

## Local storage locations

The application identifier is `io.chenmiaoi.threadline`. Desktop Settings → Account and connection → Local data storage shows the actual SQLite path.

| Data                  | macOS                                                                 | Windows                                           |
| --------------------- | --------------------------------------------------------------------- | ------------------------------------------------- |
| Desktop SQLite        | `~/Library/Application Support/io.chenmiaoi.threadline/threadline.db` | `%APPDATA%\io.chenmiaoi.threadline\threadline.db` |
| Credential vault root | `~/Library/Application Support/io.chenmiaoi.threadline/vault/`        | `%LOCALAPPDATA%\io.chenmiaoi.threadline\vault\`   |

Within the vault root, `<client-id>.session.v3.vault` holds the encrypted credential payload and `keys/<client-id>.v3.key` holds its key. A lock file serializes operations across desktop and preview processes. SQLite can also create `-wal` and `-shm` companion files.

Browser development preferences use the origin's `threadline.workspace.v1` local-storage entry. Its GitHub cache uses `src-tauri/target/browser-preview.db`; its vault is shared with the desktop app. See [Development](development.md) before testing sign-in or logout in the preview.

## Credential protection and its limits

The version 3 vault uses XChaCha20-Poly1305 with a random 256-bit local key and a fresh 192-bit nonce on each write. The client ID is authenticated with the ciphertext. Writes use temporary files; creating a new key does not overwrite an existing one. Missing keys, damaged ciphertext, or a foreign client identity cause an error rather than a plaintext fallback or silent credential replacement.

The key is a separate application-managed file, not a system Keychain/Credential Manager entry. No master password is required. Unix vault directories are restricted to mode 0700 and secret files to 0600; Windows relies on the local application-data directory's permissions. A process able to read both files as the same user can recover the credentials. This protects neither a compromised user account nor backups containing both files.

Older version 2 vaults and their system-key entries are preserved without being read as a fallback. Users authorize again to create version 3 storage. See [`github_credentials.rs`](../src-tauri/src/github_credentials.rs) for the implementation.

## Cache and freshness

**SQLite collaboration data is not encrypted.** It can contain repository names, identities, PR/Issue descriptions, comments, file patches, check results, and contribution data, including content from private repositories. Treat database copies, screenshots, and backups accordingly. Workspace preferences and saved snooze records also persist locally. Schema version 3 adds native notification checkpoints and a durable outbox. The outbox stores repository scopes, revision identifiers, thread numbers, categories, retry state, and delivery acknowledgements; it does not duplicate comment bodies or credentials. Checkpoints contain SHA-256 revision signatures. Treat these metadata tables as private workspace data. Older builds that only understand schema version 2 refuse to open a migrated database.

Response keys partition data by application client ID, account, repository, operation, record number, and HEAD where applicable. Successful responses retain their original fetch time. Corrupt cached responses become cache misses. Initial freshness policies are:

| Content                  | Freshness interval                                                      |
| ------------------------ | ----------------------------------------------------------------------- |
| Workspace lists          | Selected refresh interval; 5 minutes when automatic refresh is disabled |
| PR checks                | 30 seconds                                                              |
| Files for a known HEAD   | 10 minutes                                                              |
| Current UTC-year profile | 15 minutes                                                              |
| Earlier-year profile     | 24 hours                                                                |
| Other detail resources   | 2 minutes                                                               |

List updates or a different expected HEAD can force earlier revalidation. Manual refresh requests live data. The in-memory resource cache retains at most 24 responses; persisted response retention is bounded across accounts to 128 entries and 32 MiB, with a 16 MiB per-entry limit. Writes and legacy migration prune responses older than 30 days. These bounds concern retained response payloads, not the physical database file size or all saved workspace state.

A saved session and cached records may appear before background network verification, including during a network outage. Cache reads check local credential identity, not current GitHub authorization. Therefore, remote revocation cannot be detected while offline, and a recent cache hit may defer a content request until its freshness interval expires. This is an availability tradeoff, not a guarantee that cached data remains authorized or current.

Transient failures preserve available snapshots and show an error/retry state. Confirmed account or repository access failures purge the appropriate persisted responses and session. A detected HEAD change purges that PR's cached overview and sections. Invalidation guards prevent older pending reads from restoring the removed data.

## Logout and network boundaries

Confirmed logout removes the active version 3 credential file and key, account-scoped responses, cached session, repository selection, native reminder checkpoints, and queued notifications in the current host database. It **does not erase workspace preferences, read/unread markers, or saved snoozes**, and it does not delete the other host's separate database. Version 2 storage is preserved. Logout does not revoke GitHub-side authorization; users manage that separately in GitHub account settings.

GitHub API and OAuth requests run in Rust over HTTPS. The frontend can load remote avatars from `avatars.githubusercontent.com`, and explicit GitHub/authentication links open in the system browser. The production [content security policy](../src-tauri/tauri.conf.json) restricts frontend network and image sources. The preview bridge is development-only and restricts loopback origin and commands; it is not a public service.

For recovery steps, see [Troubleshooting](troubleshooting.md). Do not attach credential files, keys, or private database contents to public bug reports.
