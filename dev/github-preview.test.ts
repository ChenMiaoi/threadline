import { describe, expect, it } from 'vitest';
import { Socket } from 'node:net';
import { allowsCommand, allowsPreviewRequest } from './github-preview';
describe('local preview boundary', () => {
  const socket = new Socket();
  Object.defineProperty(socket, 'remoteAddress', { value: '127.0.0.1' });
  const request = {
    method: 'POST',
    socket,
    headers: {
      host: '127.0.0.1:1420',
      origin: 'http://127.0.0.1:1420',
      'x-threadline-preview': '1',
      'content-type': 'application/json',
    },
  };
  it('accepts only an explicit same-origin loopback request', () =>
    expect(allowsPreviewRequest(request)).toBe(true));
  it('rejects other origins, rebinding hosts, simple forms, and remote clients', () => {
    expect(
      allowsPreviewRequest({
        ...request,
        headers: { ...request.headers, origin: 'https://evil.test' },
      }),
    ).toBe(false);
    expect(
      allowsPreviewRequest({ ...request, headers: { ...request.headers, host: 'evil.test:1420' } }),
    ).toBe(false);
    expect(allowsPreviewRequest({ ...request, method: 'GET' })).toBe(false);
    expect(
      allowsPreviewRequest({
        ...request,
        headers: { ...request.headers, 'content-type': 'text/plain' },
      }),
    ).toBe(false);
    expect(
      allowsPreviewRequest({
        ...request,
        headers: { ...request.headers, 'x-threadline-preview': '' },
      }),
    ).toBe(false);
    const remoteSocket = new Socket();
    Object.defineProperty(remoteSocket, 'remoteAddress', { value: '192.168.1.2' });
    expect(allowsPreviewRequest({ ...request, socket: remoteSocket })).toBe(false);
  });
});

import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { createGitHubBridge } from './github-preview';

function fakeChild() {
  const process = new EventEmitter() as ChildProcessWithoutNullStreams & { stdout: PassThrough };
  Object.assign(process, {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: () => {
      process.emit('close');
      return true;
    },
  });
  return process;
}

describe('persistent GitHub bridge', () => {
  it('reuses one process and serializes concurrent requests', async () => {
    const child = fakeChild();
    let starts = 0;
    const bridge = createGitHubBridge(() => {
      starts++;
      return child;
    });
    let input = '';
    child.stdin.on('data', (chunk: Buffer) => {
      input += chunk.toString();
    });
    const first = bridge.request('github_login');
    const second = bridge.request('github_login_status');
    await Promise.resolve();
    expect(input).toBe('{"command":"github_login","args":{}}\n');
    child.stdout.write('{"ok":true,"value":{"status":"starting"}}\n');
    await first;
    await Promise.resolve();
    expect(input).toContain('{"command":"github_login_status","args":{}}\n');
    child.stdout.write('{"ok":true,"value":{"status":"waiting"}}\n');
    await expect(second).resolves.toContain('waiting');
    expect(starts).toBe(1);
    bridge.close();
    expect(child.stdin.writableEnded).toBe(true);
  });

  it('rejects malformed output and starts a fresh process on the next request', async () => {
    const children = [fakeChild(), fakeChild()];
    const bridge = createGitHubBridge(() => children.shift()!);
    const firstChild = children[0];
    const nextChild = children[1];
    const first = bridge.request('github_login');
    await Promise.resolve();
    firstChild.stdout.write('not json\n');
    await expect(first).rejects.toThrow();
    const next = bridge.request('github_login_status');
    await Promise.resolve();
    await Promise.resolve();
    nextChild.stdout.write('{"ok":true,"value":{"status":"idle"}}\n');
    await expect(next).resolves.toContain('idle');
    bridge.close();
  });

  it('rejects pending requests when the helper exits or times out', async () => {
    const child = fakeChild();
    const bridge = createGitHubBridge(() => child, 20);
    const request = bridge.request('github_login');
    await expect(request).rejects.toThrow();
    expect(child.stdin.writableEnded).toBe(true);
    bridge.close();
    await expect(bridge.request('github_login')).rejects.toThrow();
  });
});

describe('preview command validation', () => {
  it('accepts data requests without token fields', () => {
    expect(
      allowsCommand('github_request', {
        operation: 'authored',
        repo: 'llvm/llvm-project',
        accountId: 7,
        number: 0,
      }),
    ).toBe(true);
    expect(allowsCommand('github_session', {})).toBe(true);
  });
  it('rejects unknown commands, injected fields, and malformed arguments', () => {
    expect(allowsCommand('exec', { command: 'anything' })).toBe(false);
    expect(allowsCommand('github_vault_unlock', { password: 'fixture' })).toBe(false);
    expect(allowsCommand('github_request', { accessToken: 'fixture' })).toBe(false);
    expect(allowsCommand('github_request', { accountId: -1 })).toBe(false);
    expect(allowsCommand('github_request', { number: NaN })).toBe(false);
    expect(allowsCommand('github_login', [])).toBe(false);
    expect(allowsCommand('github_logout', { password: 'fixture' })).toBe(false);
  });
});

it('allows local cache reads while rejecting extra arguments and invalid resource identities', () => {
  expect(allowsCommand('github_cached_session', {})).toBe(true);
  expect(allowsCommand('github_cached_session', { token: 'unexpected' })).toBe(false);
  expect(
    allowsCommand('github_cached_request', {
      operation: 'files',
      repo: 'owner/project',
      accountId: 7,
      number: 42,
      head: 'a'.repeat(40),
    }),
  ).toBe(true);
  expect(allowsCommand('github_cached_request', { accountId: -1 })).toBe(false);
});
