import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function verify(app: string) {
  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app], {
    stdio: 'pipe',
  });
  console.log(`Verified application signature: ${app}`);
}

export function verifyMacosBundles(bundle: string, requireUpdater = false) {
  verify(join(bundle, 'macos/ThreadLine.app'));
  const images = readdirSync(join(bundle, 'dmg')).filter((name) => name.endsWith('.dmg'));
  if (images.length !== 1) throw new Error('Expected exactly one macOS disk image.');
  const temporary = mkdtempSync(join(tmpdir(), 'threadline-signature-'));
  const mount = join(temporary, 'mounted');
  let mounted = false;
  try {
    execFileSync(
      'hdiutil',
      ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, join(bundle, 'dmg', images[0])],
      { stdio: 'pipe' },
    );
    mounted = true;
    verify(join(mount, 'ThreadLine.app'));
    if (requireUpdater) {
      const archives = readdirSync(join(bundle, 'macos')).filter((name) =>
        name.endsWith('.app.tar.gz'),
      );
      if (archives.length !== 1) throw new Error('Expected exactly one macOS updater archive.');
      execFileSync('tar', ['-xzf', join(bundle, 'macos', archives[0]), '-C', temporary]);
      verify(join(temporary, 'ThreadLine.app'));
    }
  } finally {
    // Detach before removing the temporary directory so cleanup never traverses the image.
    if (mounted) execFileSync('hdiutil', ['detach', mount], { stdio: 'pipe' });
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.platform !== 'darwin') throw new Error('Signature verification requires macOS.');
  if (!process.argv[2])
    throw new Error('Usage: verify-macos-bundles.ts <bundle-directory> [--updater]');
  verifyMacosBundles(resolve(process.argv[2]), process.argv[3] === '--updater');
}
