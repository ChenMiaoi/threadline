# ThreadLine

A local-first desktop workspace for GitHub collaboration.

## Technology Stack

- TypeScript + React + Vite for the interface.
- Rust + Tauri 2 for desktop windows and application commands.
- SQLite through rusqlite with bundled SQLite for local persistence, accessed exclusively by Rust.

## Development

Requires Node.js 22.12+, stable Rust, Visual Studio C++ Build Tools, and WebView2 on Windows.

```sh
npm install
npm run desktop
```

Run `npm run dev` to preview the interface in a browser. Browser previews do not access SQLite.

```sh
npm run build
npm run check
npm run check:rust
npm run test:rust
npm run desktop:build
```

Desktop builds produce a Windows NSIS installer by default. Configure application signing before publishing a release.

Run `npm run check` before committing. It runs ESLint, Rust Clippy, Prettier, rustfmt, TypeScript checks, frontend command bridge tests, SQLite persistence tests, and frontend and desktop build checks. Use `npm run format` to format source files and `npm test -- src/lib/desktop.test.ts` to run a specific frontend test file. See [AGENTS.md](./AGENTS.md) for contribution rules.

## Current Scope

The initial scaffold includes the main branch, a dark application shell, navigation for Inbox, Authored Pull Requests, Review Requests, and Issues, a settings page, SQLite initialization and versioned migrations, and persistence of the last opened view.

GitHub authentication, repository synchronization, notifications, and pull request and issue workflows are not implemented yet. The interface displays a disconnected state without sample collaboration records.

The database is stored in Tauri's application data directory as `io.chenmiaoi.threadline/threadline.db`, typically under `%APPDATA%` on Windows. The settings page shows the actual path. Do not commit databases or account credentials to Git.

## Project Structure

```text
src/                     React interface and desktop command bridge
public/assets/figma/     Local design assets
src-tauri/src/           Rust desktop layer and SQLite access
src-tauri/migrations/    Versioned database migrations
src-tauri/capabilities/  Window permissions
```

## Documentation Language

Documentation is written in English by default. Chinese translations must use a `-zh` or `-cn` filename suffix, such as `README-zh.md` or `setup-cn.md`.

## Continuous Integration

GitHub Actions runs the [CI workflow](./.github/workflows/ci.yml) on pushes, pull requests, and manual dispatches. The Windows job installs dependencies with `npm ci`, runs `npm run check`, and builds an unsigned debug NSIS installer using `npm run build:desktop:installer`. Installer artifacts include the license and are retained for seven days. These artifacts are intended for testing; production releases require a separate release build and signing.

CI uses Node.js 24.22.1 and Rust 1.98.1 with Clippy and rustfmt. Actions are pinned to commit hashes, permissions are read-only, and newer runs cancel superseded runs for the same branch or pull request.

## License

ThreadLine is licensed under the GNU General Public License version 3.0 only (`GPL-3.0-only`). See [LICENSE](./LICENSE) for the full license text.
