import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import type { IncomingMessage } from 'node:http';

const origin = 'http://127.0.0.1:1420';
const binary = fileURLToPath(
  new URL(
    `../src-tauri/target/debug/github-preview${process.platform === 'win32' ? '.exe' : ''}`,
    import.meta.url,
  ),
);
const commandFields: Record<string, Record<string, 'string' | 'number'>> = {
  github_session: {},
  github_cached_session: {},
  github_cached_request: {
    operation: 'string',
    repo: 'string',
    number: 'number',
    accountId: 'number',
    head: 'string',
    searchDays: 'number',
  },
  github_login: {},
  github_login_status: {},
  github_login_cancel: {},
  github_logout: {},
  github_open: { url: 'string' },
  github_select_repository: { repo: 'string', accountId: 'number' },
  github_request: {
    operation: 'string',
    repo: 'string',
    number: 'number',
    accountId: 'number',
    head: 'string',
    searchDays: 'number',
  },
};
export function allowsCommand(command: string, args: unknown): args is Record<string, unknown> {
  if (
    !Object.hasOwn(commandFields, command) ||
    typeof args !== 'object' ||
    args === null ||
    Array.isArray(args)
  )
    return false;
  const fields = commandFields[command];
  if (
    !Object.entries(args).every(
      ([key, value]) =>
        Object.hasOwn(fields, key) &&
        typeof value === fields[key] &&
        (typeof value !== 'number' || (Number.isSafeInteger(value) && value >= 0)),
    )
  )
    return false;
  return true;
}
const unavailable = '本地 GitHub 连接不可用，请重新运行 npm run dev。';

export function allowsPreviewRequest(
  request: Pick<IncomingMessage, 'method' | 'headers' | 'socket'>,
) {
  return (
    request.method === 'POST' &&
    request.headers.host === '127.0.0.1:1420' &&
    request.headers.origin === origin &&
    request.headers['x-threadline-preview'] === '1' &&
    request.headers['content-type'] === 'application/json' &&
    ['127.0.0.1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '')
  );
}

export function createGitHubBridge(
  start: () => ChildProcessWithoutNullStreams = () =>
    spawn(binary, ['--bridge'], { windowsHide: true }),
  timeout = 130000,
) {
  let child: ChildProcessWithoutNullStreams | undefined;
  let closed = false;
  let pending: { resolve: (line: string) => void; reject: (error: Error) => void } | undefined;
  let tail: Promise<unknown> = Promise.resolve();

  function stop() {
    const current = child;
    child = undefined;
    if (current) {
      current.stdin.end();
      const timer = setTimeout(() => current.kill(), 1000);
      timer.unref();
      current.once('close', () => clearTimeout(timer));
    }
    pending?.reject(new Error(unavailable));
    pending = undefined;
  }

  function getChild() {
    if (closed) throw new Error(unavailable);
    if (child) return child;
    const current = start();
    child = current;
    current.stderr.resume();
    const lines = createInterface({ input: current.stdout });
    lines.on('line', (line) => {
      if (child !== current) return;
      try {
        if (line.length > 64 * 1024 * 1024) throw new Error('Response too large');
        const result: unknown = JSON.parse(line);
        if (
          !pending ||
          typeof result !== 'object' ||
          result === null ||
          !('ok' in result) ||
          typeof result.ok !== 'boolean' ||
          (result.ok
            ? !('value' in result)
            : !('error' in result) || typeof result.error !== 'string')
        )
          throw new Error('Invalid bridge response');
        const active = pending;
        pending = undefined;
        active.resolve(line);
      } catch {
        stop();
      }
    });
    current.on('error', () => {
      if (child === current) stop();
    });
    current.on('close', () => {
      if (child === current) stop();
    });
    current.stdin.on('error', () => {
      if (child === current) stop();
    });
    return current;
  }

  function request(command: string, args: Record<string, unknown> = {}): Promise<string> {
    const result = tail.then(
      () =>
        new Promise<string>((resolve, reject) => {
          let current: ChildProcessWithoutNullStreams;
          try {
            current = getChild();
          } catch {
            reject(new Error(unavailable));
            return;
          }
          const timer = setTimeout(stop, timeout);
          pending = {
            resolve: (line) => {
              clearTimeout(timer);
              resolve(line);
            },
            reject: (error) => {
              clearTimeout(timer);
              reject(error);
            },
          };
          current.stdin.write(`${JSON.stringify({ command, args })}\n`);
        }),
    );
    tail = result.catch(() => undefined);
    return result;
  }

  return {
    request,
    close: () => {
      closed = true;
      stop();
    },
  };
}

export function githubPreview(): Plugin {
  const auth = createGitHubBridge();
  return {
    name: 'threadline-local-github',
    apply: 'serve',
    closeBundle() {
      auth.close();
    },
    configureServer(server) {
      server.httpServer?.on('close', auth.close);
      server.middlewares.use('/__threadline/github', (request, response) => {
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        if (!allowsPreviewRequest(request)) {
          response.statusCode = 403;
          response.end(JSON.stringify({ ok: false, error: 'PREVIEW_ORIGIN_DENIED' }));
          return;
        }
        let input = '';
        request.setEncoding('utf8');
        request.on('data', (chunk: string) => {
          input += chunk;
          if (Buffer.byteLength(input) > 16384) {
            response.statusCode = 413;
            response.end(JSON.stringify({ ok: false, error: 'PREVIEW_INPUT_TOO_LARGE' }));
            request.destroy();
          }
        });
        request.on('end', () => {
          if (response.writableEnded) return;
          let parsed: unknown;
          try {
            parsed = JSON.parse(input);
          } catch {
            /* Reject invalid JSON below without echoing request content. */
          }
          if (
            typeof parsed !== 'object' ||
            parsed === null ||
            !('command' in parsed) ||
            typeof parsed.command !== 'string' ||
            !('args' in parsed) ||
            !allowsCommand(parsed.command, parsed.args)
          ) {
            response.statusCode = 400;
            response.end(JSON.stringify({ ok: false, error: 'PREVIEW_INVALID_REQUEST' }));
            return;
          }
          input = '';
          void auth.request(parsed.command, parsed.args).then(
            (output) => {
              if (!response.writableEnded) response.end(output);
            },
            () => {
              if (!response.writableEnded) {
                response.statusCode = 503;
                response.end(JSON.stringify({ ok: false, error: unavailable }));
              }
            },
          );
        });
      });
    },
  };
}
