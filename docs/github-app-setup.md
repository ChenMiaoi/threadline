# GitHub App setup

[Documentation](README.md) · [Development](development.md) · [Data and security](data-and-security.md)

This guide is for maintainers configuring a ThreadLine build or a fork. Users of an existing build follow [Getting started](getting-started.md); they do not register another app or provide a client secret.

## Register the application

Create a [GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app) under the maintainer account or organization, then configure:

| Setting                                       | Required value                                               |
| --------------------------------------------- | ------------------------------------------------------------ |
| Homepage                                      | Your project's public homepage or repository                 |
| Device flow                                   | Enabled                                                      |
| Expiring user access tokens                   | Enabled                                                      |
| Webhooks                                      | Disabled; no webhook server is used                          |
| Account, organization, enterprise permissions | No access                                                    |
| Installation availability                     | Public if other accounts or organizations need to install it |

Set only these repository permissions, all **read-only**:

- Metadata
- Contents
- Issues
- Pull requests
- Checks
- Commit statuses

Metadata is mandatory. The backend rejects write/admin access and permissions outside its supported set. Consult [GitHub's permission guide](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app) when configuring the registration.

ThreadLine uses [device flow for user access tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app), followed by refresh-token rotation. It does not implement a web callback server, create installation tokens, or sign app JWTs. No app private key or client secret is embedded in, or required by, this runtime flow.

## Configure the build

The public application metadata lives in [`src-tauri/github-app.json`](../src-tauri/github-app.json):

```json
{
  "clientId": "YOUR_GITHUB_APP_CLIENT_ID",
  "appSlug": "your-app-slug"
}
```

Replace the placeholder with the GitHub App's client ID, not its numeric app ID or a GitHub CLI OAuth client. The checked-in registration uses the slug `threadline-desktop`; its client ID is public metadata, not a credential.

For a temporary runtime override, set `THREADLINE_GITHUB_CLIENT_ID` and `THREADLINE_GITHUB_APP_SLUG` in the launching process environment. For example, in a POSIX shell:

```sh
THREADLINE_GITHUB_CLIENT_ID=YOUR_GITHUB_APP_CLIENT_ID \
THREADLINE_GITHUB_APP_SLUG=your-app-slug npm run desktop
```

Set both values to the same registration. Editing the JSON requires rebuilding Rust; environment overrides are read when the Rust process starts. The application does not load a token or client secret from these settings. The client ID also namespaces the local credentials and cache.

## Verify the integration

1. Run the [project checks](testing.md#automated-gates).
2. Start the application and authorize the configured app on GitHub's device page.
3. Confirm that the app returns to repository selection and can read a public repository.
4. Restart and verify that the login and selected repository restore.
5. With a disposable account or approved test workspace, verify logout and subsequent sign-in.

The backend verifies the remote app's client ID, permission set, and installations. It accepts only expiring GitHub App user tokens with refresh credentials. Do not fall back to classic personal access tokens, broad OAuth grants, GitHub CLI, or environment tokens to bypass a failed check.

## Private repositories and API limits

For private repositories, an owner or authorized organization administrator must install the app and select the repositories it may access. User authorization and repository installation are separate steps; the user must have access as well. Organization policy can impose additional approval or SSO requirements. GitHub describes this intersection in its [user access token documentation](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app).

Public installation availability lets other owners install the registration; it does not automatically install the app or grant access to their repositories. Private installation and organization policy need their own integration checks and are not established by a public-repository smoke test.

GitHub's [Notifications REST endpoints](https://docs.github.com/en/rest/activity/notifications) do not support GitHub App tokens. ThreadLine builds its own activity feed from PR and Issue reads and maintains read/snooze state locally. Preserve that boundary rather than adding broader credentials to imitate the GitHub notification inbox.

See [Data and security](data-and-security.md) for credential encryption, cache availability, local files, and logout behavior; see [Troubleshooting](troubleshooting.md) for connection recovery.
