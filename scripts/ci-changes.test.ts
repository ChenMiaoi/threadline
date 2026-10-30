import { execFileSync } from 'node:child_process';
import { mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { documentationOnly, needsFullChecks } from './ci-changes';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

describe('CI change scope', () => {
  it('skips native builds only for an explicit set of documentation paths', () => {
    expect(
      documentationOnly([
        'README.md',
        'docs/testing.md',
        'docs/images/workspace.png',
        '.github/ISSUE_TEMPLATE/bug-report.yml',
        '.github/pull_request_template.md',
      ]),
    ).toBe(true);
    for (const path of [
      'src/App.tsx',
      'src-tauri/Cargo.toml',
      'package-lock.json',
      '.github/workflows/ci.yml',
      'scripts/ci-changes.ts',
      'docs/example.ts',
      'public/icon.png',
      'unknown-file',
    ]) {
      expect(documentationOnly(['README.md', path])).toBe(false);
    }
    expect(documentationOnly([])).toBe(false);
  });

  it('runs full checks for tags, manual runs, new branches and unavailable history', () => {
    expect(needsFullChecks('push', 'tag', {})).toBe(true);
    expect(needsFullChecks('workflow_dispatch', 'branch', {})).toBe(true);
    expect(
      needsFullChecks('push', 'branch', { before: '0'.repeat(40), after: 'a'.repeat(40) }),
    ).toBe(true);
    expect(
      needsFullChecks('push', 'branch', { before: 'a'.repeat(40), after: 'b'.repeat(40) }),
    ).toBe(true);
  });

  it('compares all pushed commits and includes removed code paths when detecting renames', () => {
    const root = mkdtempSync(join(tmpdir(), 'threadline-ci-'));
    roots.push(root);
    const git = (...args: string[]) =>
      execFileSync('git', args, {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
    git('init');
    git('config', 'user.name', 'CI test');
    git('config', 'user.email', 'ci@example.invalid');
    git('config', 'commit.gpgsign', 'false');
    const commit = () => {
      git('add', '.');
      git('commit', '-m', 'test change');
      return git('rev-parse', 'HEAD');
    };
    writeFileSync(join(root, 'code.ts'), 'export const value = 1;');
    const base = commit();
    writeFileSync(join(root, 'README.md'), '# Documentation');
    const docs = commit();
    expect(needsFullChecks('push', 'branch', { before: base, after: docs }, root)).toBe(false);
    expect(
      needsFullChecks(
        'pull_request',
        'branch',
        { pull_request: { base: { sha: base }, head: { sha: docs } } },
        root,
      ),
    ).toBe(false);
    renameSync(join(root, 'code.ts'), join(root, 'example.md'));
    const moved = commit();
    expect(needsFullChecks('push', 'branch', { before: docs, after: moved }, root)).toBe(true);
    writeFileSync(join(root, 'README.md'), '# More documentation');
    const latest = commit();
    expect(needsFullChecks('push', 'branch', { before: docs, after: latest }, root)).toBe(true);
  });
});
