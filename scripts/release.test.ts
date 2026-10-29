import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildManifest,
  compareVersions,
  releaseConfiguration,
  releaseIdentity,
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
  it('requires all signed platform artifacts and emits versioned download URLs', () => {
    const root = fixture(),
      artifacts = join(root, 'artifacts'),
      output = join(root, 'output');
    for (const [target, file] of [
      ['aarch64-apple-darwin', 'arm.app.tar.gz'],
      ['x86_64-apple-darwin', 'intel.app.tar.gz'],
      ['x86_64-pc-windows-msvc', 'win.exe'],
    ]) {
      const directory = join(artifacts, `release-${target}`);
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, file), 'artifact');
      writeFileSync(join(directory, `${file}.sig`), 'signature');
    }
    const result = buildManifest(root, artifacts, 'v1.2.3', output);
    expect(Object.keys(result.platforms)).toHaveLength(3);
    expect(result.platforms['darwin-aarch64'].url).toContain('/v1.2.3/arm.app.tar.gz');
    rmSync(join(artifacts, 'release-x86_64-pc-windows-msvc/win.exe.sig'));
    expect(() => buildManifest(root, artifacts, 'v1.2.3', join(root, 'other'))).toThrow(
      'signed updater',
    );
  });
});
