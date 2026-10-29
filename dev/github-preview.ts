import { execFile } from 'node:child_process';
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

export function githubPreview(): Plugin {
  return {
    name: 'threadline-local-github',
    apply: 'serve',
    configureServer(server) {
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
          const child = execFile(
            binary,
            [],
            { windowsHide: true, timeout: 210000, maxBuffer: 32 * 1024 * 1024 },
            (error, stdout) => {
              if (response.writableEnded) return;
              if (error) {
                response.statusCode = 503;
                response.end(
                  JSON.stringify({
                    ok: false,
                    error: '本地 GitHub 连接不可用，请重新运行 npm run dev。',
                  }),
                );
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
