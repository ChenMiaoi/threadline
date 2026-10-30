# Getting started

ThreadLine collects your GitHub collaboration work in a desktop app. It reads GitHub data; read markers, snoozes, and preferences are local.

Closing the main window keeps ThreadLine running in the background, including automatic refresh and notifications according to your settings. Click the system tray icon (the menu bar icon on macOS), choose **Open ThreadLine**, or launch the app again to restore the existing window. Choose **Quit ThreadLine** from the tray menu or **Settings → About & updates** to save local changes and fully exit. On macOS, the Dock icon also restores the window and the application menu's Quit action saves before exiting.

## Install the app

Open the [latest release](https://github.com/ChenMiaoi/threadline/releases/latest) and select the installer for your computer:

| Platform            | Installer         |
| ------------------- | ----------------- |
| Windows x64         | `.exe` setup file |
| macOS Apple Silicon | `aarch64.dmg`     |
| macOS Intel         | `x64.dmg`         |

Run the Windows installer, or open the macOS disk image and copy ThreadLine to Applications. For detailed macOS installation and replacement steps, see [installing on macOS](macos-installation.md). The `.app.tar.gz`, `.sig`, and channel JSON assets are used by the updater; they are not the initial installer. Updater signatures are separate from operating-system code signing and notarization.

### Build from source

For local development, install the [platform prerequisites](development.md#prerequisites), open a terminal in the repository, and run:

```sh
npm ci
npm run desktop
```

The first run builds the Rust services and desktop application, so it can take longer than subsequent launches. See [development](development.md) for browser preview and packaging commands.

The [CI workflow](../.github/workflows/ci.yml) also produces debug installers for macOS and Windows. When a workflow run succeeds, its artifacts contain a macOS DMG or Windows NSIS installer. These are temporary development artifacts; macOS builds use ad-hoc signatures without Apple notarization, and Windows builds are not Authenticode-signed. Use only artifacts from a source and workflow run you trust.

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

Use the repository name in the top bar to choose another repository. The **+** button beside the sidebar repository heading opens repository selection; the repository row represents the current workspace. Changing repositories updates the workspace; results still arriving for the previous repository are discarded.

## Find your first task

- **Authored PRs** (**我发起的**): review lifecycle, review, check, and merge conditions for your pull requests.
- **Review work** (**我审阅的**): find requested reviews and follow-up changes.
- **Issues**: read issues involving you in the selected repository.
- **Inbox** (**收件箱**): see the latest related PR and issue revisions, ordered by recent activity.
- **Profile** (**个人主页**): inspect your selected-repository contribution calendar and totals.

A single click on an authored PR opens a summary preview. Double-click the row, press Enter on a focused row, or use **Open full details** (**打开完整详情**) to read its full discussion, files, and checks.

## Set your preferences

Open **Settings** (**设置**) to choose a refresh interval, language, theme, information density, and separate interface, reading, and code fonts and sizes. Desktop reminders require operating-system notification permission. Notification sounds are optional and offer previews. Quiet hours and reminder categories control popups and sounds, while local unread state remains visible in the Inbox.

Cached content may appear before a background refresh completes. Check the displayed read time and the floating warning panel when freshness matters. Use **Refresh** (**刷新**) to request current GitHub data.

Continue with [using the workspace](workspace.md), or read [data and security](data-and-security.md) before connecting private repositories.
