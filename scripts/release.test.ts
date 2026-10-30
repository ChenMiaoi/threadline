import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildManifest,
  canPublishChannel,
  compareVersions,
  releaseConfiguration,
  releaseIdentity,
  releaseNotesBody,
  validateRelease,
} from './release';
const roots: string[] = [];
function fixture(version = '1.2.3') {
  const root = mkdtempSync(join(tmpdir(), 'threadline-release-'));
  roots.push(root);
  mkdirSync(join(root, 'src-tauri'));
  mkdirSync(join(root, 'docs/release'), { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version }));
  writeFileSync(
    join(root, 'package-lock.json'),
    JSON.stringify({ version, packages: { '': { version } } }),
  );
  writeFileSync(join(root, 'src-tauri/tauri.conf.json'), JSON.stringify({ version }));
  writeFileSync(
    join(root, 'src-tauri/Cargo.toml'),
    `[package]\nname = "threadline"\nversion = "${version}"\n`,
  );
  writeFileSync(
    join(root, 'src-tauri/Cargo.lock'),
    `[[package]]\nname = "threadline"\nversion = "${version}"\n`,
  );
  writeFileSync(join(root, 'docs/release/v1.2.3-releasenote.md'), '# Release\n\nChanges');
  return root;
}
afterEach(() => {
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});
describe('release policy', () => {
  it('removes only the leading document title and preserves release sections', () => {
    expect(releaseNotesBody('\uFEFF# ThreadLine 1.2.3\r\n\r\n## Workspace\r\n\r\nChanges')).toBe(
      '## Workspace\r\n\r\nChanges\n',
    );
    expect(releaseNotesBody('## Workspace\n\nChanges')).toBe('## Workspace\n\nChanges\n');
    expect(releaseNotesBody('# Title\n\nChanges\n\n# Another section')).toBe(
      'Changes\n\n# Another section\n',
    );
    expect(() => releaseNotesBody('# ThreadLine 1.2.3')).toThrow('empty');
  });
  it('accepts stable and RC tags with a required base-version note', () => {
    expect(validateRelease(fixture(), 'v1.2.3')).toMatchObject({
      channel: 'stable',
      prerelease: false,
    });
    expect(validateRelease(fixture('1.2.3-rc.10'), 'v1.2.3-rc10')).toMatchObject({
      version: '1.2.3-rc.10',
      channel: 'preview',
      notes: 'docs/release/v1.2.3-releasenote.md',
    });
  });
  it.each([
    '1.2.3',
    'v1.2',
    'v01.2.3',
    'v1.2.3-beta1',
    'v1.2.3-rc',
    'v1.2.3-rc01',
    'v1.2.3+build',
    'v1.2.3\n',
  ])('rejects invalid tag %s', (tag) => {
    expect(() => releaseIdentity(tag)).toThrow();
  });
  it('fails before building when release notes are missing, empty or versions differ', () => {
    const root = fixture();
    rmSync(join(root, 'docs/release/v1.2.3-releasenote.md'));
    expect(() => validateRelease(root, 'v1.2.3')).toThrow();
    writeFileSync(join(root, 'docs/release/v1.2.3-releasenote.md'), ' ');
    expect(() => validateRelease(root, 'v1.2.3')).toThrow('empty');
    writeFileSync(join(root, 'docs/release/v1.2.3-releasenote.md'), '# Release');
    expect(() => validateRelease(root, 'v1.2.3')).toThrow('empty');
    writeFileSync(join(root, 'docs/release/v1.2.3-releasenote.md'), 'Changes');
    writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '1.2.4' }));
    expect(() => validateRelease(root, 'v1.2.3')).toThrow('versions');
  });
  it('requires a public key and separates stable from preview endpoints', () => {
    expect(() => releaseConfiguration('', 'stable')).toThrow('PUBLIC_KEY');
    expect(releaseConfiguration('public-key', 'preview').plugins.updater.endpoints[0]).toContain(
      '/preview.json',
    );
  });
  it('orders RC numbers numerically and graduates to the stable version', () => {
    expect(compareVersions('1.2.3-rc.10', '1.2.3-rc.2')).toBe(1);
    expect(compareVersions('1.2.3', '1.2.3-rc.10')).toBe(1);
    expect(compareVersions('1.2.2', '1.2.3')).toBe(-1);
  });
  it('publishes older prereleases without downgrading channels and still rejects stable downgrades', () => {
    expect(canPublishChannel('v0.1.3-rc1', '0.1.3')).toBe(false);
    expect(canPublishChannel('v0.1.3-rc2', '0.1.3-rc.10')).toBe(false);
    expect(canPublishChannel('v0.1.3-rc10', '0.1.3-rc.2')).toBe(true);
    expect(canPublishChannel('v0.1.3-rc1', '0.1.3-rc.1')).toBe(true);
    expect(canPublishChannel('v0.1.3', '0.1.3-rc.1')).toBe(true);
    expect(() => canPublishChannel('v0.1.2', '0.1.3')).toThrow('backwards');
    expect(() => canPublishChannel('v0.1.3-rc1', 'invalid')).toThrow('Unsupported');
  });
  it('requires all signed platform artifacts and emits versioned download URLs', () => {
    const root = fixture(),
      artifacts = join(root, 'artifacts'),
      output = join(root, 'output');
    for (const [target, file] of [
      ['aarch64-apple-darwin', 'ThreadLine.app.tar.gz'],
      ['x86_64-apple-darwin', 'ThreadLine.app.tar.gz'],
      ['x86_64-pc-windows-msvc', 'win.exe'],
    ]) {
      const directory = join(artifacts, `release-${target}`);
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, file), target);
      writeFileSync(join(directory, `${file}.sig`), 'signature');
    }
    const result = buildManifest(root, artifacts, 'v1.2.3', output);
    expect(result.notes).toBe('Changes\n');
    expect(Object.keys(result.platforms)).toHaveLength(3);
    expect(result.platforms['darwin-aarch64'].url).toContain(
      '/v1.2.3/darwin-aarch64-ThreadLine.app.tar.gz',
    );
    expect(readFileSync(join(output, 'darwin-aarch64-ThreadLine.app.tar.gz'), 'utf8')).toBe(
      'aarch64-apple-darwin',
    );
    expect(readFileSync(join(output, 'darwin-x86_64-ThreadLine.app.tar.gz'), 'utf8')).toBe(
      'x86_64-apple-darwin',
    );
    expect(readFileSync(join(output, 'darwin-aarch64-ThreadLine.app.tar.gz.sig'), 'utf8')).toBe(
      result.platforms['darwin-aarch64'].signature,
    );
    rmSync(join(artifacts, 'release-x86_64-pc-windows-msvc/win.exe.sig'));
    expect(() => buildManifest(root, artifacts, 'v1.2.3', join(root, 'other'))).toThrow(
      'signed updater',
    );
  });
});
