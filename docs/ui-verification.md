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

Fresh GitHub authorization and forced network outages are not part of the live verification. The live session reuses an existing authenticated GitHub CLI account. The application does not write comments, reviews, subscription changes, or read markers to GitHub. Operating system notification delivery is not implemented; its controls explicitly describe stored local preferences.
