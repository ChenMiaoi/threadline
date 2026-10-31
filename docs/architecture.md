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

The list scheduler uses a single completion-based timer. Concurrent refreshes share a request; an explicit refresh during cache hydration queues one live read. Temporary failures retry after 30 seconds, doubling up to a five-minute base delay with up to 20% jitter. Success resets the backoff. Authentication, permission, and non-transient failures stop automatic retries.

Offline detection pauses network reads. Reconnection requests a live refresh, including one follow-up when an older request was already pending. Window focus and visibility restoration request a refresh when the last attempt is at least one minute old; closely spaced recovery events are coalesced. Startup session failures also retry with backoff. Manual refresh disables periodic polling, but retains failure recovery and reconnection/wake catch-up.

The native HTTPS transport shares a cooldown across REST and GraphQL reads. It observes `Retry-After` and exhausted `X-RateLimit-Remaining` / `X-RateLimit-Reset` headers, falling back to at least a minute for rate limits without usable guidance. Errors carry a `retryAt` Unix-millisecond deadline to the scheduler. Manual and recovery triggers cannot bypass this deadline. OAuth credential exchanges remain outside read replay and cooldown policy.

Existing SQLite response caches and account/repository notification baselines survive restart. Cached, failed, or truncated list batches do not advance the notification baseline. This is snapshot reconciliation, not a durable event stream: search indexing delays, bounded results, and changes no longer visible in GitHub can prevent recovery of every intermediate event. The application must be running; operating-system suspension can defer timers until execution resumes. No always-on service or webhook receiver is introduced.

## Reading a pull request

A PR overview loads first. Discussion, files, and checks use separate operations, allowing the interface to show useful content before every section finishes. Section requests carry the overview's HEAD SHA and recheck it before returning data.

The resource cache is scoped by account, repository, record, operation, and revision. Recent list timestamps and expected HEAD values can require revalidation even within a nominal freshness interval. Manual refresh requests the network while retaining usable content during loading.

## Invalidation and errors

Authentication or account changes clear the active workspace. Confirmed access denials remove the affected persisted cache. A changed PR HEAD removes that record's persisted overview and sections; unrelated records remain available.

Persisted account and record epochs prevent older in-flight successes from republishing data after invalidation. Frontend generations and pending-resource invalidation provide the corresponding protection in React. Transient failures retain usable snapshots and expose a retry action. Connection and workspace synchronization errors are translated into actionable messages.

## Development bridge

[`dev/github-preview.ts`](../dev/github-preview.ts) accepts a restricted command set at the Vite development origin and communicates with [`preview.rs`](../src-tauri/src/preview.rs) over line-framed standard input/output. The helper uses a separate response database but the same credential store as the desktop app. Its serialized queue makes it useful for functional checks, not native performance comparisons.

Before changing an interface, check both the desktop command adapter and the preview adapter, then test their consumers. Keep policy in the domain/application layers and platform operations behind the existing boundaries.
