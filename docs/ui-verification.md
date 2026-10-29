# UI Verification

## October 29 Review Pass

The native ThreadLine process was running, but Computer Use could not bind to it: ScreenCaptureKit returned `-3811` (audio/video capture failure), both initially and after resetting the Computer Use session. This initial attempt therefore does not establish native behavior. A local development preview on `127.0.0.1:1420` provided supplemental browser observations using the existing read-only account and `llvm/llvm-project`.

The preview restored the account and loaded 13 open authored PRs, 21 review records, 13 Issues, and 58 Inbox records. Searching authored PRs for `229328` and Issues for `229300` each narrowed the list to the matching record. The PR preview and detail loading shell opened; the Issue reader also opened. Both detail requests remained in their loading states during observation while preview synchronization was active, so this pass does not establish successful detail loading, error recovery, or useful timing measurements. The Issue was marked unread again after each opening, restoring its observed original unread state. All four Settings sections opened, and the repository picker closed with Escape. No authorization or notification settings were changed.

At a 900 × 680 browser viewport, the review list, controls, and icon sidebar were visible and readable. At 360 × 680, long row titles were truncated; the native window's documented minimum width is 900 pixels, so this observation does not establish a native layout defect. Screenshots were observed in Computer Use but were not exported as files.

Before the focus fix, opening the repository picker by focusing the top repository button and pressing Enter, then pressing Escape on the close button, left `document.activeElement` as `BODY` instead of returning focus to the trigger. This was also observed after mouse opening. The keyboard sequence establishes the focus loss without relying on browser mouse-focus behavior. The pass did not exercise first login, real permission changes, deliberate network failures, Windows, or a physical offline transition.

After the fix, the preview was restarted and the keyboard sequence was repeated: Enter opened the picker and Escape returned focus to the `llvm/llvm-project` button. Opening it again with Enter and clicking the close button also returned focus to that button. The Inbox Issue filter showed 13 Issue records, and an unmatched authored search offered a working clear-filter action. The empty Snoozed view was also inspected. The refresh preference was restored to five minutes after temporarily selecting manual refresh.

The preview bridge serializes requests, so queued requests can delay later detail reads even after a page reload. The preview process was restarted, but detail content was not verified in this pass. Separately, a single direct service probe of PR #229328 returned overview in 2,077 ms, discussion in 1,713 ms, files in 1,612 ms, and checks in 1,708 ms. These are individual backend samples, not UI loading times or a performance distribution.

The initial `npm run check` passed with 162 frontend tests and 45 Rust tests. The temporary preview server was stopped after verification; the native application was not quit at that point.

### Native Follow-up

Computer Use subsequently recovered without changing system permissions. The previous process was quit, its termination confirmed, and the rebuilt app was launched by its full bundle path. This first native follow-up used the executable with SHA-256 beginning `8d0cf66` and preceded the later tab-navigation changes.

PR #229328 loaded its overview, description and discussion, 13 files, and 11 checks (zero failures, zero pending, nine passed, two other). In the expanded `clang/test/SemaTemplate/ext-vector-type.cpp` patch, keyboard focus and Right moved horizontally to the ends of long lines, Left returned, and automatic wrapping exposed the full text. Detail refresh completed, and returning to the authored list preserved the `229328` search. PR #228749 showed 45 checks: two failures first, zero pending, 41 passed, and two other. On this build, focusing the file tab and pressing Right did not move focus or selection, confirming the tab keyboard-navigation issue before its subsequent fix.

Issue #222941 loaded its body and comments; scrolling to the end kept the header and footer actions visible. Opening the Issue with the keyboard and closing it with Escape returned focus to its row. Its original unread state was restored. Dark and Light at the normal window size were observed; attempts to resize the native window through Computer Use did not change its size, so this follow-up does not claim a 900-pixel native pass. The original Dark theme was restored. No GitHub writes or authorization changes were made.

Native diagnostic samples for PR #229328 showed client wait / UI commit / backend of 1,964 / 28 / 1,955 ms for discussion, 2,113 / 2 / 2,109 ms for files, and 3,146 / 1 / 3,130 ms for checks. PR #228749 overview was 1,507 / 5 / 1,505 ms and checks 2,722 / 1 / 2,715 ms. Issue #222941 first read was 1,479 / 14 / 1,476 ms; cached reopen showed zero client wait and a 6 ms commit, followed by live revalidation. These are individual samples, not a timing distribution; client wait includes backend time.

A separate local CPU benchmark compared old HEAD and current pure functions using 6,200 records, 2,000 read, 2,000 explicitly unread, and 200 snoozed records. Results were deeply equal. After three warmups, the median of nine runs changed from 10.826 to 0.230 ms for effective read, 59.396 to 0.434 ms for tab counts, 44.591 to 0.672 ms for search and grouping, 6.765 to 0.153 ms for empty search, and 14.731 to 0.080 ms for grouping all 6,200 records into one group. The temporary benchmark script was not added to the repository. These are CPU measurements, not UI or network timings.

The tab-navigation build's executable SHA-256 was `fb54d489b658f06b189bc024fd110c7a6df7506d97d3bc51e531a84482c21119`, matching the checked executable. After quitting and confirming the previous process had exited, Computer Use reopened this bundle by its full path. In the authored list, Right selected the next tab and its eight merged records; Home returned to the 13 open records. In PR #229328, Right, End, and Home moved tab focus without changing the selected discussion; Enter activated files and Space activated checks. The 13 files loaded, a ReleaseNotes patch expanded, and the 11 checks loaded. In Inbox, End selected the nine mentions and Home returned to 58 unread. Searching `222941` showed one result; opening it loaded the Issue and changed unread from 58 to 57. Marking it unread restored 58. The app was left in Inbox/unread with an empty search, Dark/Comfortable, and no dialog. A real new update for PR #234848 appeared during startup; no controlled notification-delivery test was performed.

The tab-navigation build's `npm run check` passed with lint, formatting, type checks, 172 frontend tests, 45 Rust tests, frontend build, Rust checks, and the configured desktop build check.

A separate Snoozed CPU benchmark used 1,000 authored records and 200 snoozes against 6,200 records. With three warmups and nine groups of 20 iterations, median time per operation changed from 0.3665 to 0.0131 ms for same-group grouping and from 17.7586 to 0.3329 ms for snooze lookup, counting, and selection including index construction. These are CPU measurements, not UI or network timings.

### Exact Narrow-window Pass

On October 29, the `fb54d489` bundle was reopened after ScreenCaptureKit `-3811` prevented capture. A temporary Accessibility-based window adjustment set the outer frame to 900 × 712 logical points and confirmed the web area at 900 × 680; the original outer frame was 1100 × 741. No system permissions or product window configuration were changed. At that exact content size, native screenshots showed Inbox, authored, review, and Issues lists in Dark/Comfortable, Dark/Compact, and Light/Compact. All four Settings sections were inspected in Dark/Comfortable, and Appearance in Light/Compact. The visible headers, filters, rows, timestamps, and controls did not overlap or clip in those observations. Long summaries were intentionally ellipsized.

In Light/Compact, Issue #222941 loaded its body and comments; scrolling to the bottom retained the title, close control, and footer actions. Its unread state was restored. PR #229328's overview and description loaded at this size, but ScreenCaptureKit returned `-3812` when the files tab was selected and remained unavailable after a Computer Use reset. The exact-size files and checks observations therefore require the subsequent pass. A startup toast reported 25 updated PRs or Issues; this pass did not establish whether all represented genuine remote changes, so it is an observation rather than a notification correctness claim.

The next bundle, SHA-256 `e0914a473fe1838ec706fa5edd751c6725d81f69e630f14423958f90ad1d47a6`, was reopened and its web area independently reconfirmed at 900 × 680 logical points. Light/Comfortable showed the four lists and four Settings sections without visible overlap in the inspected areas. PR #229328 loaded 13 files and 11 checks; at this width, keyboard horizontal scrolling exposed long-line endings in `ext-vector-type.cpp`, and automatic wrapping made the full lines readable. The empty Snoozed state was inspected. Individual diagnostic samples for overview, discussion, files, and checks were respectively 1,912 / 6 / 1,910 ms, 1,834 / 25 / 1,827 ms, 1,650 / 2 / 1,646 ms, and 1,707 / 1 / 1,702 ms (client wait / UI commit / backend). These are single samples, not a distribution.

Another startup showed the same 25-update toast. A subsequent controlled restart showed three updates. A read-only comparison of the immediately preceding and following saved revision summaries found three matching revision changes: PRs #236740 and #234992 changed from a computed merge state to `UNKNOWN`, and #234270 changed from `UNKNOWN` to a computed state; their `updatedAt` and other fingerprint fields were unchanged. This identifies volatile merge-state changes coinciding with the three notifications, though it does not by itself establish the cause of the earlier 25. The original outer 1100 × 741 frame was restored, with Dark/Comfortable, five-minute refresh, Inbox/unread, empty search, and Issue #222941 unread. No GitHub write or authorization change was made.

The notification fix excludes the derived merge state from revision identities and silently migrates the checkpoint to version 3. Its final bundle SHA-256 was `4e9293556b285fe064d240f05c071713f29895b48ea31c2005c802125fbf26be`, matching the checked executable. After upgrading and syncing at 22:06, the version 3 baseline held 58 records and all derived cache IDs matched it. The read-only comparison with the preceding cache found three records with merge-state-only changes; their recomputed version 3 IDs remained stable. A controlled second launch synchronized at 22:07: the version 3 baseline remained 58 records, its ID set was unchanged, and all 89 source-record IDs and compared fields remained stable. Both launches were during the configured 22:00–08:00 quiet period; no toast was visible, but that absence is not independent evidence of notification behavior. The live comparison supports the merge-state identity fix; automated tests cover actual notifications and migration of old read and snooze identities. The Issue's unread state remained visible, but migration of a previously read or snoozed record was not exercised natively.

The final bundle's Dark/Comfortable Inbox was also observed at a confirmed 900 × 680 logical-point web area, with no visible overlap in that view. The final `npm run check` passed with 201 frontend tests, 45 Rust tests, lint, formatting, type checks, and configured builds. The app remained signed in at the restored original 1100 × 741 outer frame, Dark/Comfortable, five-minute refresh, Inbox/unread, empty search, and no dialog. Quiet hours remained unchanged.

## Startup Synchronization Recovery

The October 29 follow-up fixes a confirmed error-handling gap in the desktop HTTPS transport: a non-JSON HTTP failure (for example, an HTML 502 gateway page or an empty 503 response) previously became `GH_RESPONSE_ERROR` before the client could inspect its HTTP status. It therefore bypassed transient-network cache fallback and required an explicit retry. HTTP failures now preserve their status classification, including authorization and rate-limit failures; final network failures include the status, while malformed successful responses identify the request stage without exposing response contents.

REST GETs and the application's GraphQL queries now allow one retry after 750 ms for transport failures, timeouts, malformed JSON, and HTTP 500/502/503/504. Successful reads incur no delay. OAuth exchanges, GraphQL mutations, authorization failures, rate limits, oversized responses, invalid URLs, and responses with `Retry-After` are not automatically replayed. The original HTTP origin restrictions, credential handling, access validation, session recheck, and cache boundaries remain in place.

Fault-injection regression tests cover HTML/empty gateway failures followed by success, transport failures, malformed successful responses, repeated failure exhaustion, non-JSON authorization errors, OAuth/query replay eligibility, and server-directed waiting. Before the fix, three parallel rounds of four live list operations completed successfully (12/12); the historical intermittent failure was not reproduced, so its original remote status cannot be established retrospectively. This change fixes the confirmed classification/recovery defect without claiming that all possible causes of the historical error are known.

`npm run check` passed with **144 frontend tests and 45 Rust tests**, including lint, formatting, type checks, tests, and configured builds. The final installer build and DMG integrity verification passed; the bundled executable's SHA-256 matched the checked build.

The GPT-6.1 Terra xhigh subagent performed native desktop Computer Use against the final package. It confirmed process termination before each full-path relaunch:

| Run            | Observed result                                                                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cold start 1   | Initial synchronization completed at 21:05:04; all four lists displayed normally, with no `GH_RESPONSE_ERROR` or retry button.                        |
| Cold start 2   | Initial synchronization completed, including Issues at 21:06:31; all four lists displayed normally, with no error or retry button.                    |
| Cold start 3   | Initial synchronization completed and all four lists displayed normally, with no error or retry button.                                               |
| Manual refresh | All four lists refreshed successfully: Issues 21:08:56, Authored and Review 21:08:58, Inbox 21:09:03. Settings' latest synchronization matched Inbox. |

Times are October 29, Asia/Shanghai. The existing account and LLVM repository remained selected. The app was restored to Inbox/unread, empty search, no dialogs, dark theme, comfortable density, 5-minute refresh, and desktop notifications disabled. No read/unread state was changed. Live transient errors did not occur during these runs; automatic retry execution is proven by fault-injection tests, not by the live desktop observations.

Separate observation: the first two launches showed aggregate update toasts (23 and 24 records); the third did not. The pass did not establish whether these corresponded to genuine remote updates or initial data restoration. This remains an unconfirmed notification observation, separate from synchronization request errors.

## Unified Workspace Layout and Reading Experience

The October 29 UI pass introduced a shared compact page header, coordinated dark/light color tokens, consistent controls and spacing, compact activity summaries, and low-emphasis status metadata with one primary status. Explicit lifecycle, aggregate review, checks, merge conditions, and personal review labels remain distinct. Issue icons distinguish open and closed records; the sidebar exposes Snoozed directly, retains text at the normal 1100-pixel window width, and switches to named icon navigation below 1000 pixels. Settings now use bounded forms, proper switch tracks, and three equal-width theme cards. Empty Snoozed views omit unusable bulk actions.

PR headers no longer duplicate their version summary in a sidebar. The preview has more reading width, and Issue details have a larger reader with independently scrolling content and persistent header/actions. Summary-only Markdown cleanup preserves code identifiers and leaves source descriptions/comments untouched. File patches render old/new line numbers and added/removed backgrounds, with 400-row progressive rendering. Checks show separate failure, pending, pass, and other counts; failures appear first and unknown results remain explicit.

`npm run check` passed with **144 frontend tests and 40 Rust tests**, including lint, formatting, type checks, and configured builds. New tests cover unified-diff line numbering across hunks, additions/deletions and blank lines, CRLF and EOF notes, large-patch progressive disclosure, keyboard horizontal navigation and wrap controls, check ordering/totals/unknown states, Markdown cleanup without corrupting identifiers, localized review summaries without historical requirements on merged PRs, and preservation of PR identity for older saved records without status metadata. Existing search/filter/read/authentication/resource tests passed. The removed redundant Search focus-button clicks were updated while preserving the empty-filter recovery assertions.

The requested GPT-6.1 Terra xhigh subagent performed native desktop Computer Use against the rebuilt application with the existing LLVM login. Verified observations include:

| Theme / window                 | Native observations                                                                                                                                                                                                                                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dark, normal 1100 × 740        | Inbox, authored, review and Issue lists; readable headers/search/filters; PR preview; #229328 discussion, 13-file list and expanded patches; settings four sections; repository-picker cancellation; Snoozed empty state; full sidebar labels and equal theme-card widths.                                           |
| Light, normal 1100 × 740       | All four primary lists and four Settings sections, readable controls/metadata, and repository-picker cancellation on the layout adjustment build.                                                                                                                                                                    |
| Light, approximately 900 × 681 | Inbox search, authored/Issue lists, PR preview/detail, and Issue #222941 reader with visible header/footer on the layout adjustment build. The long-line fix build additionally verified the review list, all four Settings sections, Light/Compact review rows, and PR #229328's diff keyboard navigation/wrapping. |
| Dark, approximately 900 × 681  | All four primary lists and all four Settings sections on the long-line fix build, plus the Issue reader's fixed header/footer and independently scrolling body. The preceding pass also verified PR #228749's 45 checks: two failures first, zero pending, 41 passed, two other.                                     |

Issue #81503 showed a purple closed icon, while open Issues showed green icons. PR #229328 showed 11 checks (zero failures, zero pending, nine passed, two other). Issue #222941 could scroll its body independently to the end while header/footer controls remained visible; its original unread state was restored. Dark compact-density authored rows remained readable, and the agent restored Comfortable afterward. Theme changes did not alter GitHub authorization or notification preferences.

The extra small-window pass found that right ends of long lines in `clang/test/SemaTemplate/ext-vector-type.cpp` were not reachable through the attempted native horizontal gestures. The final source explicitly constrains the scroll viewport, gives code intrinsic content width, adds keyboard left/right scrolling, and offers **自动换行**. The subagent then verified the repaired reader in Light at approximately 900 × 681: focusing its named region and pressing Right moved visibly to the end of the line, Left returned to the start, and **自动换行** made lines 106/110/111 fully readable with line numbers and added-line backgrounds. Automated interaction tests also pass. CUA horizontal wheel gestures did not show a visible displacement; physical trackpad gestures were not exercised. Keyboard horizontal navigation and wrapping are the verified paths.

### Capture Recovery and Final State

During that pass, native capture began failing with ScreenCaptureKit `-3812` (invalid parameter) and `-3811` (audio/video capture failure), including attempts to select Finder. A documented Computer Use reset and fresh app bindings did not recover capture. The parent session independently reproduced the capture error. No system permissions or alternate UI-automation mechanisms were changed. The user quit ThreadLine and explicitly asked the agent to reopen it. Opening the rebuilt app restored capture, and the same Terra subagent continued the missing small-window checks and restored preferences.

At the end of the recovered pass, the subagent restored Dark/Comfortable and the original approximately 1100 × 740 window (2200 × 1480 screenshot pixels), kept LLVM signed in, retained five-minute refresh and desktop notifications off, restored Issue #222941 to unread, and left Inbox/unread with empty search and no dialog. The normal-window matrix and some Light/small-window cases were observed on the immediately preceding layout adjustment build; the narrowly scoped diff fix was rechecked natively afterward rather than claiming every page was repeated on every binary. First-login and physical offline/reconnect states were not exercised in this UI pass; their existing injected tests continue to pass.

The final packaged app received a separate native smoke pass after the saved-record icon fallback was added. The subagent confirmed the old process was closed, opened the full bundle path, verified normal-window sidebar labels, expanded PR #229328's `ext-vector-type.cpp` diff, toggled **自动换行** off/on/off through AX, and returned to Inbox. PR #229328 and Issue #222941 retained their original unread states. Later screenshots had multi-display white-area distortion, so this last toggle/return check is attributed to AX; the preceding clear small-window screenshots establish the visual wrap result. The final process was left signed in, Dark/Comfortable at 1100 × 740, with five-minute refresh, desktop notifications off, empty Inbox search, and no open dialog.

An intermittent first-sync `GH_RESPONSE_ERROR` was observed both before and during this UI pass. It also occurred on the final packaged startup; one explicit retry recovered the live workspace. This pass does not establish reliable first-attempt synchronization, and that existing read-path issue remains separate from the visual changes. Startup announced 24 updated threads after the earlier failed synchronization; the pass did not establish whether all were new remote events. Later refreshes and theme changes did not repeat that announcement. A subsequent #234270 comment/review update was independently visible in the live data. These observations are not treated as proof of notification delivery or a controlled network-performance measurement.

## Unified PR and Issue Inbox

The Inbox combines related PR and Issue reads in the selected repository, including authored, assigned, mentioned, commented, reviewed, and requested-review records. It merges successful authored/review/Issue results with an explicitly typed PR involvement search, deduplicates threads, and sorts the latest revision first. Rows identify PR versus Issue and show actual lifecycle/review state. PR/Issue filters, local unread bubbles, automatic read on opening, explicit read/unread actions, and account/repository-scoped persisted revision checkpoints are connected.

A content fingerprint detects returned comment edits, review/request changes, HEAD changes, and check state changes even when the thread timestamp stays unchanged. Such changes regain unread status and a stable first-observed display time. First import is silent; a versioned checkpoint also silently resets older partial-feed baselines when coverage changes. New revisions can show a dismissible in-app toast and optional native notifications. Quiet hours and reminder choices affect popups, not unread counts. Desktop permission is requested only when enabling that switch; background delivery never requests permission, and native submission errors remain visible. An explicit test-notification button is available while desktop notifications are enabled.

`npm run check` passed with 135 frontend tests and 40 Rust tests, including lint, formatting, types, and configured frontend/native builds. New regressions cover typed search, unioning successful Issue/authored reads when an involvement query is empty, mixed chronological ordering, revision detection, read/unread persistence, one-time announcements, restart deduplication, quiet hours, checkpoint migration, and permission denial/delivery failures.

The GPT-6.1 Terra xhigh subagent used the rebuilt native app with real LLVM data. Its first pass found that a mixed involvement search omitted Issues even though the Issues page had 13 records; merging independently typed page reads fixed this. The repaired Inbox contained **56 threads: 43 PRs and 13 Issues**. Issue #222941 (10/29 11:43) appeared between PR #234270 (11:57) and PR #230927 (09:44), confirming mixed chronological order. PR #229328 showed “PR · 开放 · 要求变更”; draft #236597 showed “PR · 草稿 · 未返回结论”. PR and Issue type filters, including open and closed Issues, were exercised.

Opening PR #234704 automatically reduced the unread bubble by one and removed it from the unread view. Its read state survived Cmd-Q and reopening. Explicit read/unread actions changed the bubble in both directions, and its original unread state was restored. Opening Issue #222941 loaded its description/comments and reduced the bubble from 56 to 55; marking it unread restored 56 and its original state.

The final cross-view check also passed with PR #230927: marking it read in Inbox changed the unread bubble from 56 to 55 and made the authored preview show disabled **已读**. Marking it unread in Inbox restored 56 and changed the authored preview to enabled **标记已读**. Its original unread state was restored, the preview was closed, and the app returned to Inbox/unread without GitHub writes.

The same native pass caught a second issue: upgrading from the earlier 21-thread prototype to the complete 56-thread feed announced 35 historical threads as new. The versioned-baseline migration fixed this, and the final package was reopened from its full bundle path: first synchronization, a manual refresh, and a second Cmd-Q/reopen produced no false toast. It retained 56 unread records (43 PRs and 13 Issues), with the tested records restored to their original unread state. The final app was left signed in to LLVM on Inbox/unread, with empty search, no dialog, dark theme, the existing five-minute refresh preference, and desktop notifications off. The Apple Silicon app and DMG were rebuilt; the final DMG passed `hdiutil verify`.

The desktop notification switch changed on and off in the native UI without a new system prompt. Clicking **发送测试通知** produced the application feedback **已向系统发送测试通知，请查看通知中心**. A window screenshot did not establish that macOS displayed a banner, and opening the system notification UI through Computer Use timed out. **Native submission was exercised; operating-system presentation remains unverified.** No real new GitHub event was generated, so real-event toast/notification delivery is covered by injected behavior tests, not claimed as a native live-event observation. The app must remain running and auto-refresh must be enabled; GitHub search indexing and the polling interval limit detection latency. This is a latest-thread feed, not a complete event log or the unsupported GitHub Notifications REST feed.

## Lifecycle Icons and Explicit Reviewer Requests

The authored-list letter avatars were replaced by text for active GitHub review requests. Empty requests no longer create a dash/avatar placeholder, recent review authors are not used as fallback assignees, and completed PRs do not display pending-reviewer metadata. Lifecycle icons are shared across authored rows, review rows, and detail headings: green/open, gray/dashed draft, purple/merged, and red/crossed closed without merge. They use inline vector strokes with theme-aware colors and accessible names; lifecycle badge colors match.

`npm run check` passed with 125 frontend tests, 39 Rust tests, lint/format/types, and configured builds. New regressions verify that historical reviewers are not presented as pending requests and that icon names distinguish all four lifecycle states, with terminal states taking precedence over stale draft flags.

A Terra xhigh native pass against the rebuilt app confirmed green open-PR icons in authored/review rows and a detail heading, with accessible lifecycle names and no title obstruction. The authored list no longer had right-hand letters/dash placeholders; real requests such as #229328 (`vgvassilev`) and #228990 (`hubert-reinterpretcast`) appeared as text after the next action. Draft #236597 exposed the accessible name **草稿 PR**; review rows exposed open and merged icon names.

The user navigated to PR #234704 during the pass, so the agent stopped switching pages and left that detail open. Multi-display capture distortion limited visual inspection of the gray draft glyph. Purple merged/red closed author-list glyphs, the originally requested detail cases, light theme, and hover tooltips were not visually verified in this native pass. The code and automated tests cover the four lifecycle mappings; these limits are not represented as full native coverage.

### Follow-up: All Remaining Lifecycle Colors Verified

At the user's explicit request, the GPT-6.1 Terra xhigh subagent completed the three outstanding color checks against real LLVM PRs in the native desktop app's current dark theme. Each result was visually confirmed in a readable screenshot and cross-checked with its text badge and accessible name:

| PR      | Lifecycle              | Visible icon                                                   |
| ------- | ---------------------- | -------------------------------------------------------------- |
| #236597 | Draft                  | Gray dashed branch; accessible name **草稿 PR**                |
| #229010 | Merged                 | Purple joining branches; accessible name **已合并的 PR**       |
| #230895 | Closed without merging | Red branch with a cross; accessible name **已关闭未合并的 PR** |

Initial multi-display capture distortion was resolved using the native window menu to temporarily move the app to the built-in Retina display. The window was then returned to its original external display without changing its size or system permissions. The final app state remained signed in to LLVM, on the authored unfinished list, with search cleared, no selected row, and preview closed. This completes the previously missing dark-theme color/shape checks. Light theme and hover tooltips were not tested. No source changes were needed, so code tests were not rerun for this documentation-only follow-up.

## Remove the Status Explanation Panel

The visible **状态说明** section was removed from the authored list, review list, and PR detail page at the user's request. Labeled status badges, badge hover descriptions, next-action text, and status classification are retained. The unused legend component and styles were deleted. Historical verification below describes the earlier interface. `npm run check` passed (123 frontend tests, 39 Rust tests, lint/format/types and configured builds). A Terra xhigh native check of the rebuilt app confirmed the control was absent on all three pages, with readable badges/actions and no obvious leftover gaps or overlap. The app was returned to the authored LLVM list with preview closed.

## On-demand PR Preview

The authored list no longer automatically selects its first item or permanently displays a bottom "latest activity" area. A row click explicitly opens **PR 预览**, labeled as the last synchronized description/comment summary. Search, state, and attention-filter changes clear that selection. Closing or Escape restores row focus, and the panel toggle can reopen the selected record. Full details remain available by double-click, Enter, and the preview's explicit detail button.

At 1400 CSS pixels and above, the list and a 320-pixel preview share a grid; below that width, the modeless preview floats on the right and does not reserve list space. The preview can scroll, and its header/close control stays available. The panel reads existing list data without adding a backend request.

`npm run check` passed: 123 frontend tests, 39 Rust tests, lint, format, types, and frontend/native builds. Updated behavior tests cover no initial preview, no unrelated automatic selection after filtering, Escape/close/focus restoration, toolbar reopen, and all detail entry paths. App-level tests continue to cover read-marker consistency and preserved list search/scroll on returning from details.

A GPT-6.1 Terra xhigh subagent verified the rebuilt macOS app. On initial entry there was no selected row or preview, and the preview toggle was disabled. Selecting PR #229328 opened a titled summary with its synchronization-source note; selecting #228749 changed the displayed record. Escape and the close control restored row focus, and the toolbar reopened the same selected PR.

Search, lifecycle tabs, and the attention filter all cleared selection and hid the preview. Double-click, focused-row Enter, and the preview's detail button opened full details; returning preserved the corresponding selection and preview visibility. In the normal window (approximately 1100 CSS pixels wide), the floating panel's title, close control, summary, and actions were visible without overflow. The native Window → Zoom action reached the wide layout: the panel occupied its own right column, the left rows/statuses remained readable, and closing the panel restored the list width.

The window was restored to its original size, the attention filter was cleared, and the app was left signed in to LLVM with an unselected authored list and hidden preview. Existing summaries were too short to exercise independent panel scrolling or sticky header behavior, so those CSS paths were not claimed as natively verified. The no-additional-request property is established by the component's use of existing props, not inferred from Computer Use observations. The rebuilt DMG checksum and packaged/native executable match were verified.

## Distinct PR Status Dimensions

The next UI iteration separated lifecycle, aggregate review decision, current-HEAD checks, and GitHub merge conditions into labeled text badges. Review participation adds a separate personal-review badge with current/older/unknown revision context. A next-action sentence and expandable status explanations make the dimensions readable without relying on colors or tooltips alone.

Classification fixes cover approved PRs previously grouped as waiting for review, completed PRs incorrectly treated as needing re-review, new review requests confused with post-review commits, and missing revision/history data incorrectly implying a known code update. Draft and terminal lifecycle states take precedence for next actions. `BLOCKED` is only reported when GitHub returns it; its specific cause is not inferred. Unknown review/merge information directs the user to confirm details rather than fabricating a pending-review requirement. A clean GitHub merge state can coexist with an unavailable aggregate review decision.

`npm run check` passed with 121 frontend tests and 39 Rust tests, plus lint, formatting, types, and frontend/native builds. The new tests cover independent approval/check/merge dimensions, terminal/draft precedence, unknown values, personal review versus aggregate review, re-requested reviews, truncated history, revision uncertainty, and accessible text in selectable rows.

Terra xhigh native regression used the rebuilt macOS app and public LLVM data:

- PR #229328: open / changes requested / checks passing / merge rules blocked.
- PR #230927: open / aggregate review decision unavailable / checks passing / merge conditions clean.
- PR #236597: draft / aggregate review decision unavailable / checks passing / draft merge stage.
- PR #228990 displayed a merge conflict, #228749 displayed failed checks, and merged PR #228721 retained historical failed checks while showing the workflow as ended.

The first native pass found two issues: a generic `aria-label` hid badge values from the row's accessible name, and the taller summary was compressed by flex layout, overlapping the branch controls. The fixes remove the accessible-name override and let the summary retain its full content height. Regression tests verify the former; native long/short-title checks verify the layout. A visible note distinguishes the list's earlier sync snapshot from independently refreshed details, since GitHub may calculate merge conditions after the first read. The state legend explains that checks and reviews on a completed PR are historical results, not outstanding work.

The final package's focused native recheck passed. Accessible row text explicitly included each badge value. Long-title #229328, shorter-title #230927, and draft #236597 showed separate, non-overlapping summary rows and visible branch/refresh/GitHub controls. The refresh button performed a new read. The authored merged (eight) and closed-without-merge (two) lists matched their lifecycle labels. Review filters showed one requested review, zero drafts, and eight completed PRs; #230692 exposed aggregate changes requested separately from the current user's absence of a formal conclusion. The state explanation and distinct list-sync/detail-read timestamps were visible.

Overview client-wait samples were approximately 1.3–1.9 seconds, with 4–5 ms UI commits; live network conditions prevent a controlled performance comparison. The change adds GraphQL fields to existing queries rather than adding new request operations. Unknown merge states, personal approval, and old-revision personal review did not appear in the final live data, so those branches are covered by automated tests rather than claimed as native observations. Hover tooltips and different window widths were not tested. The app was left signed in to the LLVM workspace.

## Staged Detail Loading and UI Follow-up

The next iteration added per-operation timing with `Instant` around credential access, live access checks, data reads, final session recheck, and cache writes. Individual HTTP request spans include transport, response reading, and JSON decoding. The desktop interface also records client waiting time and the interval from receiving data to React's layout commit; these are different intervals and should not be added as independent network costs. Screen refresh, later lazy/Suspense work, and Computer Use observation overhead are not measured by the commit value.

Two direct Rust-service baseline probes, using the current account and public LLVM repository, measured the previous aggregate detail path before this iteration's changes:

| Stage                    | PR #229328 | PR #230927 |
| ------------------------ | ---------: | ---------: |
| Local credential read    |     0.4 ms |     0.6 ms |
| Initial account identity |     320 ms |     412 ms |
| App audit                |     301 ms |     373 ms |
| Repository access        |     461 ms |     601 ms |
| Aggregate detail data    |   3,084 ms |   3,606 ms |
| Second remote identity   |     323 ms |     684 ms |
| SQLite write             |      13 ms |      15 ms |
| Total                    |   4,506 ms |   5,696 ms |

The two REST pull metadata reads alone cost about 1.8–2.0 seconds along the critical path. The update uses a standalone GraphQL overview and a small HEAD query for section consistency, runs independent access checks concurrently, and replaces the redundant second remote identity request with a locked local credential check. Live identity, app, and repository validation still gate new data and persisted-cache reads. Tests cover logout and account replacement during a data request, and denial while private cached data exists.

Direct probes after the change returned these independently requested sections:

| Operation                  | PR #229328 | PR #230927 |
| -------------------------- | ---------: | ---------: |
| Overview                   |   2,040 ms |   1,906 ms |
| Discussion, after overview |   2,050 ms |   2,186 ms |
| Files, when selected       |   1,824 ms |   2,062 ms |
| Checks, when selected      |   1,863 ms |   2,044 ms |

Each probe used a newly created HTTP client process and an in-memory SQLite database. These are individual samples affected by live GitHub/network conditions, not percentiles or a controlled speedup ratio. First useful content is the overview; a complete first discussion takes the overview plus its discussion request. Loading all tabs is deliberately different from the old aggregate request, so the overview duration must not be represented as full-detail completion.

UI changes include explicit back/refresh controls, independent tab progress/errors/retry, preserved list search and scroll position, Enter to open a selected PR, always-visible activity search, scoped memory reuse with live revalidation, memoized/preloaded Markdown, recent discussion batches, and file patches mounted only when expanded. Previously hidden search constraints, misleading first-row selection styling, missing Issue retry controls, and oversized detail sidebars were corrected. Settings exposes the recent diagnostic samples for native verification. A regression test prevents manual refresh from being mislabeled as initial cached-render time.

A GPT-6.1 Terra xhigh subagent exercised the rebuilt native app. In-app diagnostic samples from two PRs produced the following measurements (the operation sequence identifies the PR; diagnostic entries intentionally contain no record identifiers):

| Native operation      | Client wait | UI commit |  Backend |
| --------------------- | ----------: | --------: | -------: |
| PR #230927 overview   |    1,297 ms |      4 ms | 1,295 ms |
| PR #230927 discussion |    1,921 ms |     16 ms | 1,913 ms |
| PR #230927 files      |    1,800 ms |      1 ms | 1,796 ms |
| PR #230927 checks     |    1,839 ms |      1 ms | 1,834 ms |
| PR #229328 overview   |    1,165 ms |      3 ms | 1,163 ms |
| PR #229328 files      |    1,468 ms |     <1 ms | 1,464 ms |
| PR #229328 checks     |    1,651 ms |      1 ms | 1,647 ms |

For PR #229328, the overview's backend stages were credentials <1 ms, live access 502 ms, GraphQL data 659 ms, local session recheck 1 ms, and SQLite 1 ms. For PR #230927 on a subsequent revalidation, they were 1, 515, 657, <1, and 1 ms respectively (backend total 1,174 ms). UI work is small compared with network waiting in these samples. An overview and a first discussion are separate sequential operations; for the first row's PR, useful description/metadata appears after about 1.3 seconds and the full discussion after a further 1.9 seconds.

Reopening already-read content showed cached overview, discussion, files, and checks with zero additional network wait before initial display. Observed cached commit samples were 1–22 ms (including 18 ms for discussion and 22 ms for overview on one PR, and 7/8 ms on another). Live revalidation still followed; these numbers do not mean fresh GitHub data can be fetched in milliseconds.

Functional native checks passed for:

- Authored PR states, number search, selection/preview, Enter to open, and the explicit back button. Opening a draft from the bottom of the list showed the detail from the top; returning restored the original draft/scroll position. The search term was preserved.
- Review search (`235313`), attention filtering, and empty filtered results.
- Issue label and number filters (`good first issue` / `229300`), body/comments, last-read timestamp, close, and cached reopen with an update notice.
- PR discussion, file expansion, checks, manual refresh, repeated open, and independent tab loading for PRs #229328 and #230927.
- All four Settings sections, repository picker cancel, the Inbox limitation, and the empty Snoozed page.

Regression found a diagnostic bug: a manual refresh could incorrectly label the component's lifetime as cached-render time. The fix only records an initial cached commit and never records a failed retry using an old response timestamp; both paths have regression tests. A minor empty-state message was also made neutral to the selected filter, and the client metric was renamed to explain remaining wait when an in-flight request is reused. The final rebuilt package was then rechecked after quitting the earlier process and reopening the bundle from its full path. Manual refresh no longer generated an incorrect cached-render sample, the updated empty-filter message appeared, and the metric label was **客户端等待**. Final PR #229328 samples were:

| Final-package operation    | Client wait | UI commit |  Backend |
| -------------------------- | ----------: | --------: | -------: |
| Overview                   |    1,173 ms |      4 ms | 1,171 ms |
| Discussion, after overview |    1,723 ms |     26 ms | 1,715 ms |
| Files                      |    1,372 ms |      2 ms | 1,368 ms |
| Checks                     |    1,606 ms |      1 ms | 1,601 ms |
| Explicit overview refresh  |      971 ms |      2 ms |   969 ms |
| Cached overview on reopen  |        0 ms |      1 ms |        — |

A further Cmd-Q and reopening of this final bundle automatically restored the account, LLVM repository, and 11 open authored PRs without a keychain/master-password prompt. The app was left signed in with the LLVM list available. All native regression findings were resolved and specifically rechecked. Different window widths and deliberate physical network failures were not tested. ScreenCaptureKit temporarily failed during the run; resetting the Computer Use session restored access without changing system permissions.

This iteration passed `npm run check`: 110 frontend tests, 39 Rust tests, lint/format/types, and frontend/native builds. Live private-repository checks, Windows, physical offline transitions, and large-data native rendering have not been exercised. Automated failure/revision/cache tests cover paths that would be unsafe or unreliable to reproduce by revoking the real user's access.

## First Performance Iteration and Software-owned Storage

On October 29, 2026, `npm run check` passed after connection reuse, concurrent review searches and PR detail reads, progressive workspace results, refresh coalescing, and version 3 software-owned credential storage were implemented. This included 100 frontend tests, 33 Rust tests, lint, formatting, type checks, and frontend/native build checks. The debug app and DMG were also rebuilt.

Regression tests hold independent requests until all expected peers have started, verifying actual overlap without using elapsed-time thresholds. They also cover independent list completion, overlapping refresh triggers, late repository/account results, changed PR HEAD, required endpoint failures, optional check failures, local key loss/corruption, restart restoration, and preserved version 2 files. Functional test durations are not network performance measurements.

Version 3 stores its encryption key in a separate application-owned local file and does not access an OS credential entry. Version 2 ciphertext is preserved without reading its system key; upgrading requires signing in once. Local file encryption does not protect against a process that can read both the key and ciphertext as the same user. See [authorization and storage](./github-app-setup.md).

A GPT-6.1 Terra xhigh subagent then exercised the actual rebuilt macOS desktop app through Computer Use:

- The old process was quit and the rebuilt bundle opened. The version 2 storage-upgrade message appeared, confirming the new implementation was running. Signing in through the existing read-only ThreadLine Desktop GitHub App succeeded.
- Selecting `llvm/llvm-project` showed 11 open authored PRs, 20 review entries, and 13 issues (nine open, four closed).
- Issues refreshed without duplicate visible entries. The refresh button was disabled while syncing, and filters remained responsive. Completion was observed after approximately 5.5 seconds, including Computer Use overhead and observation intervals.
- Searching issues for `229300` reduced the authored-issue filter from three records to Issue #229300. Searching PRs for `230927` reduced the list to that PR.
- PR #229328 displayed 24 discussion entries, 13 changed files, an expanded ReleaseNotes patch, and 11 checks (nine passing). Returning to the list and reopening the detail worked. PR #230927 displayed 40 discussion entries, seven files, and 11 checks.
- Three detail-load observations took approximately 5.7, 6.1, and 5.0 seconds. These include Computer Use/tool overhead and observation intervals; they are not precise network timings, percentiles, or a measured before/after speedup. There was no comparable timed baseline for the old build.
- Cmd-Q followed by reopening the same bundle restored the account and LLVM workspace without another authorization. Explicit logout followed by Cmd-Q and reopening stayed signed out, with Settings showing that GitHub was disconnected.
- A final sign-in and repository selection succeeded, leaving the desktop app connected and usable. No system keychain or master-password prompt was observed throughout these checks.

The rebuilt DMG passed `hdiutil verify`; its packaged executable matched the checked native executable by SHA-256. Screenshots were observed through Computer Use, but no screenshot files were exported. Private repositories, Windows native behavior, physical offline recovery, and large-data rendering performance were not exercised. Each operation still performs live identity and permission checks, and persisted data is not served immediately before those checks. Browser-preview queueing was not changed or used as a desktop performance measurement.

## Earlier OS-keyed Authorization and Storage (Version 2)

The earlier version 2 implementation used its own read-only GitHub App and an application-owned encrypted credential vault with an OS-protected random key. Historical checks using shared GitHub CLI credentials or system keychain storage do not validate the current split key/ciphertext implementation.

On October 29, 2026, a GPT-6.1 Terra xhigh subagent exercised the actual macOS Tauri app through Computer Use with the independent GitHub App:

- An initially empty ThreadLine credential store showed the logged-out screen even though GitHub CLI was authenticated.
- Device authorization completed on GitHub's official page for ThreadLine Desktop. The app completed login automatically and opened repository selection.
- `llvm/llvm-project` loaded without installing the app on that repository: 11 open authored PRs, 20 review entries, and 13 issues (nine open and four closed) were observed for the signed-in account.
- PR #236597 loaded its discussion, 16 changed files, and ten checks. **View on GitHub** opened the matching GitHub URL in Chrome.
- The Inbox displayed the explicit GitHub App token limitation.
- Confirming the already-selected LLVM repository preserved the loaded workspace after fixing a request-invalidation bug. A regression test covers this behavior.
- Logout, repeat login, and restart restoration were exercised using the previous app-owned keychain entry. Those persistence results must be repeated for the current encrypted-file and OS-protected-key implementation.

The registered public GitHub App has only repository Metadata, Contents, Issues, Pull requests, Checks, and Commit statuses permissions, all read-only. No repository installation, signing key, client secret, or broad GitHub CLI authorization was created for public-repository testing. Private installation was not submitted or verified.

## Version 2 Encrypted Vault Verification

`npm run check` passed for this implementation: lint, formatting, types, 98 frontend tests, 27 Rust tests, and frontend/native builds.

The earlier master-password experiment was removed: normal launches must restore the saved login automatically. Version 2 automated tests exercised restart restoration without a password, credential and key deletion on logout, unique ciphertext, tampering, foreign client IDs, missing/unavailable OS keys, file permissions, and cross-process locking. Key access failures do not erase or overwrite saved credentials, and failed key creation cannot fall back to plaintext or process memory. Frontend tests verify restore on remount and no restore after explicit logout.

The development preview uses the same Rust services through a persistent helper. Its loopback/origin boundary and command schema are tested; obsolete password/unlock commands are rejected. Credentials and encryption keys are never returned to the frontend.

The rebuilt native app was tested with Computer Use by the Terra xhigh subagent. First sign-in through ThreadLine Desktop completed without a master-password form or password prompt, and the repository picker opened automatically. Selecting `llvm/llvm-project` loaded 11 authored PRs, 20 review entries, and 13 issues. The application created its new encrypted session file. Using the same binary without rebuilding, Cmd-Q followed by reopening restored the account, LLVM repository, and the same live collaboration views without a password or another GitHub authorization. Explicit logout immediately cleared the account, repository, and counts; quitting and reopening afterward stayed signed out. These are historical native Computer Use results for version 2, separate from the earlier system-token and master-password experiments. The macOS DMG checksum passed `hdiutil verify`, and its packaged executable matched the checked native build.

## macOS Window Behavior

macOS uses a visible native titlebar and system traffic lights. The web header omits custom drag markers and Windows-style window controls. The default window is centered at 1100 × 740 with a 900 × 680 minimum. The Apple Silicon application and DMG have been built locally; unsigned debug bundles are for development, not notarized releases.

Native minimize/restore, full-screen/exit, titlebar double-click, and opening external GitHub links were exercised. Native menu actions produced real window movement. Controlled synthetic titlebar drags did not produce attributable movement through Computer Use. The user subsequently dragged the native titlebar and confirmed that the window moved on October 29, 2026. **Native titlebar dragging is manually verified by the user**, not claimed as an automated drag result. ScreenCaptureKit intermittently returned `-3811`, `-3812`, or distorted multi-display frames. Temporary pointer/window-event probes were removed from source.

The new macOS CI job has not run remotely. Windows was not rerun on this Mac. Physical network disconnection/reconnection was not exercised; injected failure tests cover request errors and recovery. A fresh offline launch requires a live identity/access check before persisted account-scoped records can be served.

## Earlier Interface Audit

An earlier browser audit covered navigation, repository selection, filters, search, PR discussions and file/check views, settings, appearance, narrow layouts, local read markers, and snoozing. Browser widths included 1440, 900, 648, and 360 pixels. Those checks used the earlier shared CLI integration and establish interface history only. Current Inbox capability and authentication behavior are covered separately above.
