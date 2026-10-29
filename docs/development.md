# Development

[Documentation](README.md) · [Architecture](architecture.md) · [Testing](testing.md)

Use this guide to run ThreadLine, build a local installer, or prepare a change.

## Prerequisites

- Node.js and npm. For parity with CI, use Node.js **24.22.1**.
- Rust with Cargo, Clippy, and rustfmt. CI uses **Rust 1.98.1**.
- macOS: Xcode Command Line Tools (`xcode-select --install`).
- Windows: Microsoft C++ Build Tools with the desktop C++ workload, an MSVC Rust toolchain, and Microsoft Edge WebView2.

Follow [Tauri's platform prerequisites](https://v2.tauri.app/start/prerequisites/) for installation details. The configured CI and installer targets are macOS and Windows; other platforms have no equivalent project release gate. GitHub CLI is not required, and its login is not imported.

## Run the desktop app

From the repository root:

```sh
npm ci
npm run desktop
```

Tauri starts Vite and the native app. The first Rust build can take longer while dependencies compile. Sign in using the [getting started guide](getting-started.md). Maintainers changing the GitHub App registration should follow [GitHub App setup](github-app-setup.md).

## Run the browser development preview

```sh
npm run dev
```

Open `http://127.0.0.1:1420/`. The `predev` script builds the Rust `github-preview` helper automatically. The server uses a strict port: close the previous server if port 1420 is occupied.

The development adapter allows only the configured loopback host, origin, request headers, and command schema. It calls the same Rust GitHub services, but serializes bridge requests; queued browser requests are not representative of native request latency. After changing Rust, stop Vite, run `npm run build:github-preview`, and restart the preview: Vite excludes Rust files from its watcher.

**The preview shares the desktop credential vault.** Signing in, refreshing credentials, or logging out affects that same local login. Its other storage is separate:

| State                                     | Desktop                     | Browser development preview           |
| ----------------------------------------- | --------------------------- | ------------------------------------- |
| Preferences, read markers, snoozes        | Application SQLite database | Browser local storage                 |
| GitHub responses and repository selection | Application SQLite database | `src-tauri/target/browser-preview.db` |
| Login credentials                         | Application vault           | Same application vault                |

`npm run build` writes the frontend to `dist/`. `npm run preview` serves that build without the development GitHub bridge; it is not a substitute for a connected desktop app.

## Build locally

| Command                           | Result                                                     |
| --------------------------------- | ---------------------------------------------------------- |
| `npm run build`                   | TypeScript check and frontend production build             |
| `npm run build:desktop:check`     | Debug native build, without an installer                   |
| `npm run build:desktop:installer` | Debug native app and platform installer                    |
| `npm run desktop:build`           | Tauri's default release-profile build and platform bundles |

Build the native target on its host platform. Debug installer output is under `src-tauri/target/debug/bundle/`: macOS uses `macos/ThreadLine.app` and `dmg/*.dmg`; Windows uses `nsis/*-setup.exe`. Default release-profile bundles use `src-tauri/target/release/bundle/`. A release profile does not establish signing, notarization, or readiness for distribution. The checked-in workflow builds test installers without a configured signing/notarization step.

## Prepare a change

1. Keep domain changes in the shared core and host access behind its interfaces.
2. Add regression coverage for changed behavior and affected consumers.
3. Run focused tests while editing; run `npm run check` before committing.
4. Review the diff for credentials, databases, temporary output, and unrelated edits.

Use English documentation and Conventional Commits, as specified in [AGENTS.md](../AGENTS.md). Chinese documentation uses a `-zh` or `-cn` filename suffix.

Useful commands:

```sh
npm test -- src/lib/useGitHub.test.ts
npm run test:rust
npm run format
npm run check
```

See [Testing](testing.md) for the complete gate, manual verification, and evidence limits.
