# Architecture

[Documentation](README.md) · [Development](development.md) · [Data and security](data-and-security.md)

ThreadLine is a React desktop interface backed by a Tauri host. GitHub reads, credentials, and desktop persistence belong to Rust. The domain core stays independent of the browser and native host.

## Dependency boundaries

```text
React pages and components
        ↓
Application hooks → shared TypeScript core
        ↓                   ↑
GitHub / workspace adapters implement core interfaces
        ↓
Tauri commands → Rust workspace services
                    ├── GitHub client → injected HTTPS transport
                    ├── authorization → injected credential store and clock
                    └── SQLite database
```

The development preview replaces Tauri command invocation with a local Vite-to-Rust bridge. It does not replace the GitHub implementation with browser API calls.

| Layer             | Responsibility                                                                                          | Entry points                                                                                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain core       | GitHub data types and transformations, activity identity, unread state, snoozes, workspace schema       | [`src/core`](../src/core/), [`github.ts`](../src/core/github.ts), [`workspace.ts`](../src/core/workspace.ts)                                                                                                   |
| Application state | Session restoration, progressive list synchronization, cache reuse, invalidation, local workspace state | [`useGitHub.ts`](../src/lib/useGitHub.ts), [`useGitHubResource.ts`](../src/lib/useGitHubResource.ts), [`useWorkspace.ts`](../src/lib/useWorkspace.ts)                                                          |
| UI                | Navigation, filters, readers, dialogs, settings, keyboard interactions                                  | [`App.tsx`](../src/App.tsx), [`src/features`](../src/features/), [`src/components`](../src/components/)                                                                                                        |
| Host adapters     | Implement the core's `GitHubGateway` and `WorkspaceRepository` contracts                                | [`github.ts`](../src/lib/github.ts), [`workspace-storage.ts`](../src/lib/workspace-storage.ts)                                                                                                                 |
| Native boundary   | Register commands, own database state, and run blocking services off the UI thread                      | [`lib.rs`](../src-tauri/src/lib.rs)                                                                                                                                                                            |
| GitHub services   | Read-only API requests, authorization checks, session/cache coordination                                | [`github_workspace.rs`](../src-tauri/src/github_workspace.rs), [`github.rs`](../src-tauri/src/github.rs)                                                                                                       |
| Infrastructure    | HTTPS, credential vault, clock, SQLite migrations                                                       | [`github_http.rs`](../src-tauri/src/github_http.rs), [`github_auth.rs`](../src-tauri/src/github_auth.rs), [`github_credentials.rs`](../src-tauri/src/github_credentials.rs), [`db.rs`](../src-tauri/src/db.rs) |

Core modules receive data and use explicit interfaces; they do not call browser storage, Tauri commands, or Rust services. The React layer chooses a host adapter. Rust services inject transport, credential storage, and time so tests can exercise failures without a real GitHub login.

## Reading a workspace

1. The session hook asks for a locally cached session, then verifies the session through GitHub.
2. List requests hydrate saved account/repository data when available. Fresh results can satisfy the initial read; expired results remain visible while a request updates them.
3. Independent lists publish as they finish. Overlapping refresh triggers reuse ongoing work.
4. Local read, unread, and snooze state is applied to the records for display. It does not write back to GitHub.

New network reads validate account identity, app configuration, and repository access. Local cache reads verify the saved credential's account identity without making network requests. These paths intentionally have different availability guarantees; see [Data and security](data-and-security.md).

## Synchronization recovery

Desktop list synchronization runs in Rust (`background_sync.rs`), independently of WebView timers. One worker reads the active account/repository/range, performs the existing live access checks, refreshes the four lists, and publishes progressive in-memory snapshots through scoped, versioned Tauri events. Older replies cannot overwrite newer events. The React adapter subscribes before configuring the worker and consumes the returned snapshot to cover missed startup events. Desktop refresh actions signal this worker; they do not start a second frontend polling loop. Cached data remains available during startup.

Polling is scheduled from completion. Temporary failures retry from a 30-second base, doubling up to five minutes with up to 20% jitter. Transport/rate-limit failures stop the remaining list reads for that batch. Native focus restoration requests catch-up after at least a minute; it does not bypass an existing failure backoff. Native timers recheck wall-clock deadlines after sleep. Startup restoration uses saved session metadata and the saved search range. Manual mode disables periodic polling while retaining explicit refresh and failure recovery. The development browser retains its injected frontend scheduler and does not deliver activity notifications.

The native HTTPS transport shares a cooldown across REST and GraphQL reads. It observes `Retry-After` and exhausted `X-RateLimit-Remaining` / `X-RateLimit-Reset` headers, falling back to at least a minute for rate limits without usable guidance. Manual triggers cannot bypass the server deadline. OAuth credential exchanges remain outside read replay and cooldown policy.

## Durable reminders and notification channels

A complete, successful, untruncated native batch computes collaboration revisions from the same event fields used by the frontend activity model. SHA-256 signatures exclude transient mergeability and expanded older comment history; self-only replies/reviews do not create reminders. Baselines are private to account, repository, and search range. The first native observation and an explicit range change establish a silent baseline. Native baseline advancement and insertion of eligible revision IDs into the SQLite outbox commit in one transaction. A failed write rolls both back. The frontend's persisted read/unread and migration state remains independent; it never sends a second activity popup.

A separate native delivery worker drains the outbox even while network reads are blocked. It rechecks the active identity, selected repository, notification categories, snoozes, quiet hours, and delivery preferences. Quiet hours defer pending reminders; subsequent delivery groups up to 50 revisions. A persisted 60-second delivery lease is required before OS submission; a reservation failure sends nothing. Failed submissions retry with bounded backoff. System notification and sound acknowledgements are stored separately, so a sound retry does not resend an already acknowledged popup. Pending rows survive restart. Confirmed logout or repository access denial purges affected queued data and baselines; temporary credential-read errors preserve them. Stale batch generations and access epochs prevent late results from recreating invalidated observations.

Delivery is **at least once**: a crash between OS acceptance and the acknowledgement commit can repeat a submission. A stable macOS request identifier reduces duplicate Notification Center entries, but neither platform APIs nor a successful submission prove that a banner was visible. Permissions and Focus settings still apply. Pending capacity is 10,000 revisions; capacity failure blocks baseline advancement and remains visible. Completed tombstones retain at most 5,000 rows and up to 30 days; checkpoint history retains at most 128 ranges.

This remains snapshot reconciliation, not a GitHub event stream. Search indexing delays, bounded results, and changes no longer visible in GitHub can prevent recovery of intermediate events. The app must remain running; closing its window hides it, while fully quitting or OS suspension stops execution. No always-on service or webhook receiver is introduced.

## Reading a pull request

A PR overview loads first. Discussion, files, and checks use separate operations, allowing the interface to show useful content before every section finishes. Section requests carry the overview's HEAD SHA and recheck it before returning data.

The resource cache is scoped by account, repository, record, operation, and revision. Recent list timestamps and expected HEAD values can require revalidation even within a nominal freshness interval. Manual refresh requests the network while retaining usable content during loading.

## Invalidation and errors

Authentication or account changes clear the active workspace. Confirmed access denials remove the affected persisted cache. A changed PR HEAD removes that record's persisted overview and sections; unrelated records remain available.

Persisted account and record epochs prevent older in-flight successes from republishing data after invalidation. Frontend generations and pending-resource invalidation provide the corresponding protection in React. Transient failures retain usable snapshots and expose a retry action. Connection and workspace synchronization errors are translated into actionable messages.

## Development bridge

[`dev/github-preview.ts`](../dev/github-preview.ts) accepts a restricted command set at the Vite development origin and communicates with [`preview.rs`](../src-tauri/src/preview.rs) over line-framed standard input/output. The helper uses a separate response database but the same credential store as the desktop app. Its serialized queue makes it useful for functional checks, not native performance comparisons.

Before changing an interface, check both the desktop command adapter and the preview adapter, then test their consumers. Keep policy in the domain/application layers and platform operations behind the existing boundaries.
