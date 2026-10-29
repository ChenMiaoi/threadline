import { describe, expect, it } from 'vitest';
import { Socket } from 'node:net';
import { allowsPreviewRequest } from './github-preview';
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
