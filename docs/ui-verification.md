# UI Verification

Verified against live GitHub data in the local browser preview on October 29, 2026. Desktop layouts were checked at 1440 × 900 and 900 × 680, with narrow browser layouts checked at 648 × 680 and 360 pixels wide.

## Regression Coverage

| Area                   | Checks                                                                                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Navigation             | Sidebar pages, workspace menu, global search, repository picker cancellation preserving the current settings section                                        |
| Repository selection   | Search, no matches, inaccessible repository errors, switching between populated and empty repositories without retaining the previous repository's records  |
| Authored pull requests | Open/merged/closed states, attention filter, search, row selection, preview dismissal, selection staying within filtered rows, detail navigation and return |
| Pull details           | Real discussion, sanitized Markdown, foldable details, file patches, check results, long titles and paths                                                   |
| Inbox                  | All/unread/mentions, search, local read overrides, badge updates, snooze cancellation and restoration                                                       |
| Issues and reviews     | State/category filters, search, actual repository labels, empty-filter recovery, readable titles and summaries                                              |
| Appearance             | Dark/light/system themes, both densities, reduced motion, readable avatars and status colors, narrow navigation                                             |
| Settings               | Refresh preferences, manual refresh, notification preferences, quiet hours, saved preferences surviving browser reload                                      |
| Dialogs                | Bounded scrolling, reachable close controls, long issue content and repository lists                                                                        |

Snooze verification includes the preset choices, a submitted custom future date, changing a saved deadline, selecting multiple records, restoring records, and reviewing recently restored entries. Automated form tests additionally verify rejection of a nonempty past date and the exact deadline produced by every preset. Entering a nonempty past date could not be reliably exercised through browser automation. Local test changes were restored before ending the verification session.

## Automated Failure Checks

Automated tests exercise missing CLI/authentication failures, inaccessible repository selection, synchronization failure and retry, stale requests after repository changes, account changes, read-state persistence, snooze restoration, and unsafe discussion HTML. CSS layout is verified in the actual browser rather than with simulated element geometry.

The initial browser audit reused an existing authenticated GitHub CLI account. Authorization follow-up is recorded below. The application does not write comments, reviews, subscription changes, or read markers to GitHub. Operating system notification delivery is not implemented; its controls explicitly describe stored local preferences.

## Desktop and Recovery Follow-up

The Windows debug desktop application was launched directly on October 29, 2026, using its bundled frontend and real Tauri commands rather than the browser preview bridge. Repository selection, live inbox/PR/review/issue loading, page navigation, settings, and reopening the selected repository were exercised. The native titlebar was replaced with controls integrated into the application header. Dragging, double-clicking to maximize, minimize, restore from minimized state, maximize, restore from maximized state, and close were checked separately from browser behavior.

Connection regression tests verify that a temporary connection recheck failure preserves the active account, repository, and loaded records. A later successful connection or refresh clears errors; refresh also replaces stale records and updates their timestamp. Authentication loss clears the workspace, and an old request cannot clear a newly reconnected session. Window-control tests cover desktop actions, maximize-state labels, action failures and retry, listener cleanup, and omission from browser previews.

GitHub sign-in uses an application dialog backed by a hidden GitHub CLI process. A live GitHub device code was obtained and displayed in the browser preview; the official authorization page opened automatically in a new browser tab. Authorization completed for the existing account, the login dialog closed automatically, and the live repository picker opened. The dialog supports copying the code, reopening the page, waiting, cancellation, and retry. Automated tests cover polling, completion, automatic repository selection, cancellation, retry, late responses, clipboard/browser failures, process cleanup, timeout, and the persistent preview bridge. The follow-up desktop login-dialog check was interrupted by the user stopping Computer Use; the earlier desktop navigation and custom titlebar checks were completed.

Physical disconnection and reconnection were deferred during this session, so those live cases remain unverified. Failure and recovery are covered with injected gateway failures in automated tests, not claimed as a physical network test.

A fresh offline application launch currently cannot load the disk cache because the backend verifies the active account over the network before returning account-scoped records. An already-open workspace retains its loaded records on transient failures. No existing GitHub credentials were removed and no machine-wide proxy, firewall, or network settings were changed.
