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

The standard path is **create/unlock local vault → Log in to GitHub → enter device code on GitHub → authorize ThreadLine Desktop → select a public repository**. The application polls automatically. After restart, users unlock the vault with their master password to restore the saved GitHub session.

Public repositories can be read without installing the app. Private repositories require the owning account or organization to install the app and choose repositories once. For organizations this may require an administrator. Private installation was not submitted or verified in the local audit. GitHub's registration page may require maintainer signing-key setup before installation; that setup is separate from the verified public device-flow login and must never embed a signing key or client secret in the desktop app. Users authorize their own identity but do not create new application registrations. Repository selection offers the optional installation link separately from public repository access.

The backend stores access and refresh tokens in an application-owned encrypted vault. Argon2id (64 MiB, three iterations, one lane) derives a 256-bit key from a master password of at least 12 characters and a random salt. XChaCha20-Poly1305 authenticates and encrypts the payload with a fresh 192-bit nonce per write. Writes replace the ciphertext atomically. The master password is not persisted; the backend retains the unlocked key only until lock or process exit. A wrong password or damaged file returns an error without overwriting the vault. It does not import `gh` credentials or token environment variables, and it does not save tokens in SQLite or browser storage. A cross-process lock serializes refresh-token rotation between desktop and development helper processes. Lock files contain no secrets.

The device request uses `offline_access` solely to require expiring tokens; GitHub App resource permissions are configured on the app registration, not OAuth scopes. GitHub App access tokens expire after eight hours, and refresh tokens expire after six months. Device-flow refresh requests do not require a client secret. Rotation replaces both tokens; invalid or expired refresh authorization requires sign-in again.

Logging out clears this app's encrypted credential and locks the vault. A forgotten master password requires removing the app's vault file, creating a new vault, and authorizing again; there is no password recovery or plaintext fallback. Users can revoke the GitHub-side authorization in GitHub account settings. Existing CLI credentials, account configuration, and grants are not modified.

## Unsupported Notifications

GitHub Notifications REST endpoints do not support GitHub App tokens. ThreadLine displays an explicit capability limitation and keeps PR, review, and issue views available. Do not add a fallback to broad OAuth, classic PAT, or shared CLI credentials to hide this limitation.

## References

- [Register a GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app)
- [Choose GitHub App permissions](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app)
- [Generate user tokens with device flow](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)
- [Refresh user tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens)
- [GitHub Notifications API limitations](https://docs.github.com/en/rest/activity/notifications)
