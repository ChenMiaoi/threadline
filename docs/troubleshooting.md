# Troubleshooting

Start with the visible message and the last-read timestamp. Cached content can remain useful during a temporary failure, but it is not evidence that a new synchronization succeeded.

## Sign-in does not complete

If the device code expired or authorization was cancelled, start **Log in to GitHub** (**登录 GitHub**) again and use the new code on GitHub's official page. Keep ThreadLine open while it waits for authorization.

If your browser completes authorization but ThreadLine is still waiting, check connectivity and retry sign-in. GitHub CLI sign-in does not sign ThreadLine in; the application uses its own GitHub App authorization.

If an existing login is expired, revoked, or belongs to a different account, reconnect through **Settings → Account and connection** (**设置 → 账号与连接**), then choose the repository again.

## A repository cannot be found or accessed

1. Check the full `owner/repository` name and confirm the repository is visible to your intended account on GitHub.
2. For a private repository, ask its owner or organization administrator to confirm that ThreadLine Desktop is installed and that the repository is selected in the installation.
3. Check whether organization approval is still pending. User sign-in and repository installation are separate requirements.
4. Recheck the connection and retry repository selection.

A missing-record message can mean a PR or issue was removed, renamed through a repository move, or is no longer accessible. Access failures clear affected cached content rather than continuing to expose it. An unexpected app-configuration or permission warning needs the maintainer's attention; see [GitHub App setup](github-app-setup.md).

## Lists are stale or synchronization fails

Check the network connection and use **Retry synchronization** (**重试同步**) or **Refresh** (**刷新**). These actions request current data even when a cached response is still within its reuse window. A complete successful list refresh clears a prior connection error.

For a timeout or temporary GitHub failure, ThreadLine retains cached content and automatically retries with an increasing delay. The warning shows the next retry time. Offline reads pause and resume when connectivity returns. If GitHub's request quota is exhausted, all reads wait for the server-directed cooldown; repeated manual refreshes cannot bypass it. Use **Recheck connection** (**重新检查连接**) when account validation is failing.

Check **Settings → Repository and synchronization** (**设置 → 仓库与同步**) if updates only appear after manual refresh. The desktop scheduler runs in Rust and continues with its window hidden. Manual mode disables periodic polling but still recovers failed reads and catches up after reconnection or returning to the window after at least a minute. Fully quitting the app stops synchronization; computer sleep can defer reads until execution resumes. GitHub search indexing can also delay newly changed records.

An empty filtered view is different from a failed refresh. Clear search and filters to check the full available list, and inspect any error banner before treating an empty list as complete.

## PR discussion, files, or checks fail to load

Use the affected section's retry action. If the PR has new commits, refresh the overview and reopen the section so its expected HEAD matches the current revision.

A missing patch may be binary, too large for GitHub to return, or beyond GitHub's file-list limit. Use **View on GitHub** to inspect it. A PR with no reported checks is not necessarily passing; the checks page distinguishes missing, running, passing, and failing results.

## Profile totals differ from GitHub

Profile shows contributions for the **selected repository**, not your whole account. Select the intended repository and year, then refresh Profile.

Dates use UTC. Totals include commits, authored issues, authored PRs, and review contributions under GitHub's contribution rules; they do not include every discussion comment or every review event. Contributions that cannot be attributed to the repository are excluded. If GitHub returns incomplete or changing records, retry rather than interpreting the failed read as zero contributions.

A missing avatar can be a network or image-loading failure. The initial fallback does not indicate that your login was lost.

## Desktop reminders do not appear

Check that desktop notifications are enabled in **Settings → Notifications** (**设置 → 通知**) and permitted in the operating system. Check quiet hours, reminder categories, and whether the thread is snoozed. Use the notification test control to distinguish delivery problems from an absence of new updates. Its sending state and result appear directly beside the control; delivery failures also appear in the floating warning dock. On macOS, ThreadLine checks the actual [system authorization](https://developer.apple.com/documentation/usernotifications/asking-permission-to-use-notifications) and requests permission only when you explicitly enable notifications or send a test. Foreground delivery is enabled, but banner visibility still depends on system notification settings and Focus mode.

The first complete native synchronization establishes a baseline without historical popups. Pending native reminders survive restart, wait through quiet hours, and retry failed submissions. If delivery fails, the lower-right dock explains that pending reminders are retained and offers a retry action. System popup and sound submissions are tracked separately. A successful OS submission is not proof of a visible banner, and a crash before acknowledgement can repeat delivery. Restoring a cache does not trigger reminders. Failed or truncated list batches do not establish or advance the notification baseline; narrow the date range if a result-limit warning persists. The Inbox is based on repository searches, not the GitHub Notifications API, so its contents and unread counts can differ from GitHub's notification inbox.

## Saved login cannot be read

Quit and reopen ThreadLine, then recheck the connection. Missing or damaged credential files are reported rather than silently replaced. An upgrade from older credential storage can require signing in again.

If ThreadLine offers **Clear local login and reauthorize** (**清除本机登录并重新授权**), use it only when you are ready to sign in again: it removes the saved local login. The normal logout action in Settings also asks for confirmation and removes saved credentials and account cache. Neither action deletes GitHub repository data.

Do not delete the application's data directory as a general repair step. It also contains local preferences, read state, and snoozes. See [data and security](data-and-security.md) for the distinction between credentials and workspace data.

## Browser preview cannot connect

Browser preview is a development feature. Run `npm run dev` and use exactly `http://127.0.0.1:1420/`; the adapter rejects other hosts and origins. Its Rust helper is built automatically. `npm run preview` serves the production frontend build without the development GitHub adapter.

If the helper is unavailable, stop the development server and start it again. Check the [development prerequisites](development.md#prerequisites) if its build fails. Browser preferences and the preview database are separate from desktop workspace storage.

## Collect useful diagnostics

When reporting a problem, include your operating system, desktop or browser mode, the affected view, the visible error, steps to reproduce, and whether a manual retry succeeds. Share a public repository or record only when appropriate. Remove private content from screenshots and logs, and never attach credential vaults, key files, tokens, or the local database to a public report.
