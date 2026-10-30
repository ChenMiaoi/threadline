# Using the workspace

ThreadLine shows collaboration data for one selected repository. Use the repository control to change that scope; searches and filters apply within the current view.

## Choose a view

| View         | What it shows                                                                 |
| ------------ | ----------------------------------------------------------------------------- |
| Inbox        | The latest revision of related PR and issue threads, with local unread state. |
| Snoozed      | Threads deferred locally, plus recently restored items.                       |
| Authored PRs | Your pull requests, grouped by lifecycle and attention status.                |
| Review work  | Requested reviews, formal reviews, and comment participation.                 |
| Issues       | Issues involving your GitHub account.                                         |
| Profile      | Your annual contribution calendar and totals for the selected repository.     |

The Inbox uses read-only repository searches for threads you created, were assigned, were mentioned in, commented on, reviewed, or were requested to review. It is not GitHub's Notifications feed or a complete event log. Search indexing and the refresh interval affect when updates appear.

## Search and filter

The top-bar **Search my authored PRs** control (**搜索我发起的 PR**) opens the authored view and focuses its search field. It does not search the whole workspace.

Use each view's own search and filters for review work, issues, or the Inbox. Authored PRs can be filtered by lifecycle and whether action is needed. Review and issue views offer their own categories and filters. If no records match, clear the filters before assuming the repository has no relevant work.

## Preview and open a pull request

Single-click an authored PR row to open its synchronized summary preview. The preview does not fetch the full discussion. Close it with its close button or Escape; focus returns to the selected row. The preview toggle can reopen the selected PR. Changing search, status, or attention filters clears the selection.

Open full details by double-clicking a row, pressing Enter on a focused row, or choosing **Open full details** (**打开完整详情**) in the preview. Wide windows use a preview column; narrower windows position the floating preview above or below its source row.

The detail reader loads the overview first. Discussion, file changes, and checks load separately when selected, with their own loading, error, and retry controls. A new PR HEAD can require refreshing the overview before a section is shown. Use the back button to return to the list.

Discussion entries are revealed progressively. Each formal review groups its code-comment threads and their replies. A version icon shows whether the review targets the current code; hover or focus it for commit details. Replies are labeled without guessing who a participant is addressing. Expand a changed file to read its patch, or reveal more rows for a long patch. Code wraps visually at the configured width without adding source line numbers. Change the wrap width or turn wrapping off in Settings → Appearance; unwrapped diffs support horizontal scrolling. Binary or omitted patches link back to GitHub.

ThreadLine renders sanitized GitHub-flavored Markdown with syntax-highlighted code blocks. Images embedded in discussion content appear as links rather than loading automatically. The signed-in account's GitHub avatar is displayed separately, with an initial as a fallback.

## Interpret PR status

PR state has several independent dimensions:

| Dimension        | Interpretation                                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Lifecycle        | Open, draft, merged, or closed without merging. Completed work is not an outstanding action.                                     |
| Review           | GitHub's aggregate formal-review decision. Approval does not mean the PR has merged.                                             |
| Checks           | The current HEAD's check rollup. Missing or unknown checks do not mean success.                                                  |
| Merge conditions | GitHub-reported conflicts, blocked rules, an outdated base, or readiness. A blocked state does not identify its cause by itself. |
| My review        | Your formal conclusion and whether it targets the current or an earlier commit. Commenting does not count as approval.           |

Separate status badges distinguish these states. Open PRs with requested changes also use a yellow leading icon. Check and review results on completed PRs are historical. New commits can invite another review without implying that GitHub dismissed your earlier approval.

Review summaries use the latest 100 reviews and disclose truncated history when your conclusion cannot be established. The full detail reader loads paginated review history.

## Manage local read state and snoozes

Mark a thread read to clear its local unread state. A new revision can make it unread again. Snooze a thread to set it aside until a chosen time; use **Snoozed** (**稍后处理**) to inspect deferred and recently restored items.

These actions stay on your device. They do not change GitHub notification read state, subscriptions, issues, or PRs. ThreadLine does not send comments or reviews, merge PRs, or edit repository data; use **View on GitHub** for actions on GitHub.

The first complete live Inbox synchronization establishes a baseline without notifying for historical records. Later updates can produce an in-app toast and an optional desktop notification. Cached hydration alone does not create notifications or replace that baseline. Quiet hours and reminder categories affect popups, not Inbox membership or unread counts. The app must be running to poll; manual refresh mode and an exited app do not poll.

## Read your contribution calendar

**Profile** (**个人主页**) shows the signed-in user's GitHub identity, avatar, and contributions for the selected repository and year. Its four totals count commits, authored issues, authored PRs, and code reviews. The calendar total is their sum.

Dates use UTC. Review contributions follow GitHub's contribution rules: only the most recent review for each reviewed PR is counted. Restricted contributions that cannot be attributed to the selected repository are excluded. These figures are not the account-wide GitHub contribution graph and do not count every comment or review event.

Choose a year to inspect another period. Focus the calendar and use Up/Down for adjacent days, Left/Right for adjacent weeks, and Home/End for the first/last day. The selected date and contribution count appear beneath the calendar.

## Refresh and cached content

ThreadLine restores locally cached responses after checking the saved credential identity, then validates the session in the background. Fresh responses can be reused without a network read. Older responses remain visible during a background update, with their original timestamps. Recoverable errors appear in the lower-right floating warning panel, which collapses to a button after inactivity and disappears when the error clears.

Reuse windows depend on the content: rapidly changing checks refresh sooner than historical profile data. List reuse follows the configured refresh interval, with a five-minute reuse window in manual mode. See the [cache freshness policy](data-and-security.md) for the complete windows and storage limits.

A known newer record revision or changed PR HEAD triggers refresh even within these windows. **Refresh** and retry actions request network data. Authentication or access denial clears affected cached data; temporary transport failures can retain it. See [data and security](data-and-security.md) for storage boundaries and [troubleshooting](troubleshooting.md) for recovery.

## Data limits

GitHub search returns at most 1,000 matching results; ThreadLine reports that limit rather than presenting a partial list as complete. GitHub also limits PR file lists to 3,000 files and may omit large or binary patches. Profile loading reports incomplete or changing contribution data rather than silently treating missing data as zero. Follow the record's GitHub link when the API cannot provide the full content.
