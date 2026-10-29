import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
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
const authCommands = new Set(['github_login', 'github_login_status', 'github_login_cancel']);
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

export function createAuthBridge(
  start: () => ChildProcessWithoutNullStreams = () =>
    spawn(binary, ['--auth-bridge'], { windowsHide: true }),
  timeout = 10000,
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

  function request(command: string): Promise<string> {
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
          current.stdin.write(`${JSON.stringify({ command })}\n`);
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
  const auth = createAuthBridge();
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
            /* Existing helper handles invalid JSON. */
          }
          if (
            typeof parsed === 'object' &&
            parsed !== null &&
            'command' in parsed &&
            typeof parsed.command === 'string' &&
            authCommands.has(parsed.command)
          ) {
            if (
              !('args' in parsed) ||
              typeof parsed.args !== 'object' ||
              parsed.args === null ||
              Array.isArray(parsed.args) ||
              Object.keys(parsed.args).length !== 0
            ) {
              response.statusCode = 400;
              response.end(
                JSON.stringify({ ok: false, error: 'Invalid authentication arguments' }),
              );
              return;
            }
            void auth.request(parsed.command).then(
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
            return;
          }
          const child = execFile(
            binary,
            [],
            { windowsHide: true, timeout: 210000, maxBuffer: 32 * 1024 * 1024 },
            (error, stdout) => {
              if (response.writableEnded) return;
              if (error) {
                response.statusCode = 503;
                response.end(JSON.stringify({ ok: false, error: unavailable }));
                return;
              }
              response.end(stdout);
            },
          );
          child.stdin?.end(input);
        });
      });
    },
  };
}
