import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function releaseNotesBody(markdown: string) {
  const body = markdown
    .trim()
    .replace(/^#[ \t]+[^\r\n]*(?:\r?\n|$)/, '')
    .trim();
  if (!body) throw new Error('Release notes must not be empty after removing the title.');
  return body + '\n';
}

export function releaseIdentity(tag: string) {
  const match = /^v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))(?:-rc(0|[1-9]\d*))?$/.exec(tag);
  if (!match || match[0] !== tag) throw new Error('Release tag must be vX.Y.Z or vX.Y.Z-rcX.');
  return {
    tag,
    version: match[1] + (match[2] === undefined ? '' : `-rc.${match[2]}`),
    notes: `docs/release/v${match[1]}-releasenote.md`,
    channel: match[2] === undefined ? 'stable' : 'preview',
    prerelease: match[2] !== undefined,
  };
}
export function validateRelease(root: string, tag: string) {
  const identity = releaseIdentity(tag);
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  const tauri = JSON.parse(readFileSync(join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
  const cargo = readFileSync(join(root, 'src-tauri/Cargo.toml'), 'utf8').match(
    /^version = "([^"]+)"/m,
  )?.[1];
  const cargoLock = readFileSync(join(root, 'src-tauri/Cargo.lock'), 'utf8').match(
    /\[\[package\]\]\s+name = "threadline"\s+version = "([^"]+)"/,
  )?.[1];
  const versions = [
    pkg.version,
    lock.version,
    lock.packages[''].version,
    tauri.version,
    cargo,
    cargoLock,
  ];
  if (versions.some((value) => value !== identity.version))
    throw new Error(`All application versions must equal ${identity.version}.`);
  releaseNotesBody(readFileSync(join(root, identity.notes), 'utf8'));
  return identity;
}
export function releaseConfiguration(publicKey: string, channel: string) {
  if (!publicKey.trim()) throw new Error('THREADLINE_UPDATER_PUBLIC_KEY is required.');
  if (!['stable', 'preview'].includes(channel)) throw new Error('Invalid release channel.');
  return {
    bundle: { createUpdaterArtifacts: true },
    plugins: {
      updater: {
        pubkey: publicKey.trim(),
        endpoints: [
          `https://github.com/ChenMiaoi/threadline/releases/download/update-channel/${channel}.json`,
        ],
      },
    },
  };
}
const targets = {
  'aarch64-apple-darwin': 'darwin-aarch64',
  'x86_64-apple-darwin': 'darwin-x86_64',
  'x86_64-pc-windows-msvc': 'windows-x86_64',
};
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((item) =>
    item.isDirectory() ? files(join(directory, item.name)) : [join(directory, item.name)],
  );
}
export function buildManifest(root: string, artifactRoot: string, tag: string, output: string) {
  const identity = validateRelease(root, tag);
  const platforms: Record<string, { url: string; signature: string }> = {};
  mkdirSync(output, { recursive: true });
  for (const [target, platform] of Object.entries(targets)) {
    const all = files(join(artifactRoot, `release-${target}`));
    const signatures = all.filter((file) =>
      file.endsWith(target.includes('windows') ? '.exe.sig' : '.app.tar.gz.sig'),
    );
    if (signatures.length !== 1)
      throw new Error(`Expected one signed updater artifact for ${target}.`);
    const artifact = signatures[0].slice(0, -4);
    if (!existsSync(artifact)) throw new Error(`Missing signed artifact for ${target}.`);
    const signature = readFileSync(signatures[0], 'utf8').trim();
    if (!signature) throw new Error(`Empty signature for ${target}.`);
    platforms[platform] = {
      url: `https://github.com/ChenMiaoi/threadline/releases/download/${tag}/${encodeURIComponent(`${platform}-${basename(artifact)}`)}`,
      signature,
    };
    for (const file of all.filter((file) => /\.(dmg|exe|sig|tar\.gz)$/.test(file))) {
      const destination = join(output, `${platform}-${basename(file)}`);
      if (existsSync(destination)) throw new Error(`Duplicate release artifact: ${basename(file)}`);
      copyFileSync(file, destination);
    }
  }
  const manifest = {
    version: identity.version,
    notes: releaseNotesBody(readFileSync(join(root, identity.notes), 'utf8')),
    pub_date: new Date().toISOString(),
    platforms,
  };
  writeFileSync(join(output, `${identity.channel}.json`), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
export function compareVersions(a: string, b: string) {
  const parse = (value: string) => {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:-rc\.(\d+))?$/.exec(value);
    if (!match) throw new Error(`Unsupported channel version: ${value}`);
    return [
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
      match[4] === undefined ? Infinity : Number(match[4]),
    ];
  };
  const left = parse(a),
    right = parse(b);
  for (let index = 0; index < left.length; index++)
    if (left[index] !== right[index]) return left[index] > right[index] ? 1 : -1;
  return 0;
}
async function main() {
  const [command, tag, artifactRoot, output] = process.argv.slice(2);
  const root = process.cwd();
  const identity = validateRelease(root, tag);
  if (command === 'validate') {
    console.log(`Validated ${tag}: ${identity.notes}`);
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        Object.entries(identity)
          .map(([key, value]) => `${key}=${value}\n`)
          .join(''),
      );
  } else if (command === 'notes') {
    writeFileSync(artifactRoot, releaseNotesBody(readFileSync(join(root, identity.notes), 'utf8')));
  } else if (command === 'prepare') {
    if (!process.env.TAURI_SIGNING_PRIVATE_KEY)
      throw new Error('TAURI_SIGNING_PRIVATE_KEY is required.');
    writeFileSync(
      '.release-config.json',
      JSON.stringify(
        releaseConfiguration(process.env.THREADLINE_UPDATER_PUBLIC_KEY ?? '', identity.channel),
      ),
    );
  } else if (command === 'manifest') {
    buildManifest(root, artifactRoot, tag, output);
  } else if (command === 'channel' || command === 'promote') {
    const channel = command === 'promote' ? 'preview' : identity.channel;
    const response = await fetch(
      `https://github.com/ChenMiaoi/threadline/releases/download/update-channel/${channel}.json`,
      { signal: AbortSignal.timeout(30_000) },
    );
    if (response.status !== 404) {
      if (!response.ok) throw new Error(`Channel check failed: HTTP ${response.status}`);
      const existing = (await response.json()) as { version: string };
      if (compareVersions(identity.version, existing.version) < 0) {
        if (command === 'promote') return;
        throw new Error('Refusing to move the update channel backwards.');
      }
    }
    if (command === 'promote') {
      if (identity.prerelease)
        throw new Error('Only stable releases can graduate the preview channel.');
      copyFileSync(join(artifactRoot, 'stable.json'), join(artifactRoot, 'preview.json'));
    }
  } else throw new Error('Unknown release command.');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
