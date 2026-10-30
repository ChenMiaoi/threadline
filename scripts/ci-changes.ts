import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type ChangeEvent = {
  before?: string;
  after?: string;
  pull_request?: { base: { sha: string }; head: { sha: string } };
};

export function documentationOnly(paths: string[]) {
  return (
    paths.length > 0 &&
    paths.every(
      (path) =>
        /^[^/]+\.md$/.test(path) ||
        path === 'LICENSE' ||
        /^docs\/.+\.(md|png|jpe?g|gif|webp|svg)$/.test(path) ||
        /^\.github\/ISSUE_TEMPLATE\/[^/]+\.(md|ya?ml)$/.test(path) ||
        path === '.github/pull_request_template.md',
    )
  );
}

export function needsFullChecks(
  eventName: string,
  refType: string,
  event: ChangeEvent,
  cwd = process.cwd(),
) {
  if (refType === 'tag' || !['push', 'pull_request'].includes(eventName)) return true;
  const base = eventName === 'pull_request' ? event.pull_request?.base.sha : event.before;
  const head = eventName === 'pull_request' ? event.pull_request?.head.sha : event.after;
  if (![base, head].every((sha) => sha && /^[a-f0-9]{40}$/.test(sha) && !/^0+$/.test(sha)))
    return true;
  try {
    const range = eventName === 'pull_request' ? `${base}...${head}` : `${base}..${head}`;
    // Renames must include the old path, so moving code into docs cannot skip checks.
    const paths = execFileSync('git', ['diff', '--no-renames', '--name-only', '-z', range, '--'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .split('\0')
      .filter(Boolean);
    return !documentationOnly(paths);
  } catch {
    console.warn('Unable to compare changes; running full checks.');
    return true;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const full = needsFullChecks(
    process.env.GITHUB_EVENT_NAME ?? '',
    process.env.GITHUB_REF_TYPE ?? '',
    JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH!, 'utf8')),
  );
  console.log(`Full platform checks: ${full}`);
  appendFileSync(process.env.GITHUB_OUTPUT!, `full=${full}\n`);
}
