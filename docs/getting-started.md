# Getting started

ThreadLine collects your GitHub collaboration work in a desktop app. It reads GitHub data; read markers, snoozes, and preferences are local.

## Run the app

ThreadLine is in early development. The supported development path is to build from source. Install the [platform prerequisites](development.md#prerequisites), open a terminal in the repository, and run:

```sh
npm ci
npm run desktop
```

The first run builds the Rust services and desktop application, so it can take longer than subsequent launches. See [development](development.md) for browser preview and packaging commands.

The [CI workflow](../.github/workflows/ci.yml) also produces unsigned debug installers for macOS and Windows. When a workflow run succeeds, its artifacts contain a macOS DMG or Windows NSIS installer. These are temporary development artifacts; they are not signed or notarized production releases. Use only artifacts from a source and workflow run you trust.

## Sign in to GitHub

1. Choose **Log in to GitHub** (**登录 GitHub**).
2. ThreadLine displays a device code and opens GitHub's authorization page. Check that the page is on GitHub, then enter the displayed code.
3. Authorize **ThreadLine Desktop**. Return to ThreadLine; sign-in completes automatically and repository selection opens.

Ordinary users do not register a GitHub App or supply credentials in a configuration file. ThreadLine does not use GitHub CLI credentials or personal access tokens. Sign-in is stored locally and restored after restarting, unless you log out or GitHub authorization expires or is revoked.

If the code expires, start sign-in again to obtain a new code. See [troubleshooting](troubleshooting.md) if authorization does not complete.

## Choose a repository

Select a repository from the picker, or enter its full name as `owner/repository`. The selected repository scopes the collaboration lists and Profile contribution calendar.

For a **public repository**, no app installation is required.

For a **private repository**, its owner or organization must install ThreadLine Desktop and grant access to that repository. The optional **Add private repository access** action opens the installation flow. Organization policy may require an administrator's approval. Each user still signs in with their own GitHub identity; installing the app does not replace user authorization.

Use the repository name in the top bar or the sidebar repository control to switch repositories later. Changing repositories updates the workspace; results still arriving for the previous repository are discarded.

## Find your first task

- **Authored PRs** (**我发起的**): review the status and next action for your pull requests.
- **Review work** (**我审阅的**): find requested reviews and follow-up changes.
- **Issues**: read issues involving you in the selected repository.
- **Inbox** (**收件箱**): see the latest related PR and issue revisions, ordered by recent activity.
- **Profile** (**个人主页**): inspect your selected-repository contribution calendar and totals.

A single click on an authored PR opens a summary preview. Double-click the row, press Enter on a focused row, or use **Open full details** (**打开完整详情**) to read its full discussion, files, and checks.

## Set your preferences

Open **Settings** (**设置**) to choose a refresh interval, theme, and information density. Desktop reminders are optional and require operating-system notification permission when enabled. Quiet hours and reminder categories control popups, while local unread state remains visible in the Inbox.

Cached content may appear before a background refresh completes. Check the displayed read time and any update banner when freshness matters. Use **Refresh** (**刷新**) to request current GitHub data.

Continue with [using the workspace](workspace.md), or read [data and security](data-and-security.md) before connecting private repositories.
