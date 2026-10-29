# GitHub App Setup

This checklist is for ThreadLine maintainers. Ordinary users sign in to the distributed app; they do not register GitHub Apps or supply client secrets.

## Shared Application Registration

The current application is **ThreadLine Desktop**, owned by `ChenMiaoi`, with slug `threadline-desktop`. Its client ID in `src-tauri/github-app.json` is public application metadata, not a secret. The original name `ThreadLine` was reserved on GitHub.

Register a GitHub App under a maintainer account and configure:

- Homepage: the project's public repository URL.
- Device flow: enabled.
- Expiring user tokens: enabled.
- Webhooks: disabled; no webhook endpoint or secret is needed.
- Account, organization, and enterprise permissions: no access.
- Repository permissions: Metadata, Contents, Issues, Pull requests, Checks, and Commit statuses, each read-only. Metadata is mandatory.
- Installation availability: public, so other users and organizations can install the same app. Making the app public does not automatically grant it access to the maintainer's repositories.

No OAuth web callback, backend authorization server, app private key, or client secret is required for this device-flow implementation. The application does not generate installation access tokens or sign app JWTs. It uses user access tokens for the signed-in user's identity, limited by the app's read-only permissions and any installation's selected repository access.

For a fork with its own app registration, update the public client ID and app slug in `src-tauri/github-app.json`, or set `THREADLINE_GITHUB_CLIENT_ID` and `THREADLINE_GITHUB_APP_SLUG` at launch. Keep the permission set unchanged; the backend rejects write/admin and unexpected permissions. The client ID must identify a GitHub App, not the shared GitHub CLI OAuth application.

## User Experience

The standard path is **Log in to GitHub → enter device code on GitHub → authorize ThreadLine Desktop → select a public repository**. The app polls automatically. It remembers the login and restores the selected repository after restart without a master password or another GitHub authorization.

Public repositories can be read without installing the app. Private repositories require the owning account or organization to install the app and choose repositories once. For organizations this may require an administrator. Private installation was not submitted or verified in the local audit. GitHub's registration page may require maintainer signing-key setup before installation; that setup is separate from the verified public device-flow login and must never embed a signing key or client secret in the desktop app. Users authorize their own identity but do not create new application registrations. Repository selection offers the optional installation link separately from public repository access.

The backend stores access and refresh tokens in an application-owned version 3 encrypted vault. XChaCha20-Poly1305 authenticates and encrypts the payload using a random 256-bit key and a fresh 192-bit nonce per write. The application manages the key in a separate local file (`vault/keys/<client-id>.v3.key`); the payload is stored as `vault/<client-id>.session.v3.vault`. No system credential-store access or user-created master password is required. A missing or damaged key returns an error without silently replacing existing credentials.

The app does not import `gh` credentials or token environment variables, and does not save tokens in SQLite or browser storage. A cross-process lock serializes vault changes and refresh-token rotation between desktop and preview helper processes. Lock files contain no secrets. Key creation is atomic and does not overwrite existing keys. On Unix, directories use mode 0700 and secret files use 0600; Windows inherits the per-user local application-data directory permissions. Local encryption does not protect against a process that can read both the key and ciphertext under the same user account.

Version 2 vaults used macOS Keychain or Windows Credential Manager. Upgrading preserves those files and does not read the old system key. Users sign in once to create version 3 storage; the old file is not a fallback and is never overwritten by the new vault.

Logging out removes the version 3 encrypted credential file and its local key. Reopening after logout stays signed out. Legacy version 2 files and system entries are not accessed or deleted by the new implementation. Users can revoke GitHub-side authorization in account settings; existing CLI credentials and grants are not modified. Temporary network failures do not remove the saved login.

## Unsupported Notifications

GitHub Notifications REST endpoints do not support GitHub App tokens. ThreadLine displays an explicit capability limitation and keeps PR, review, and issue views available. Do not add a fallback to broad OAuth, classic PAT, or shared CLI credentials to hide this limitation.

## References

- [Register a GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app)
- [Choose GitHub App permissions](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app)
- [Generate user tokens with device flow](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)
- [Refresh user tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens)
- [GitHub Notifications API limitations](https://docs.github.com/en/rest/activity/notifications)
