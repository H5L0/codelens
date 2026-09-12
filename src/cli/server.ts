// ---------------------------------------------------------------------------
// 本地托管
// 用 node 内置 http 提供静态页面与两份数据接口，API 中间件同时供 Vite 开发服务器复用。
// ---------------------------------------------------------------------------
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';

export type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;

/** 已经序列化好的两份数据，启动时生成一次。 */
export interface Payloads {
  data: string;
  loc: string;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
};

function sendJson(res: ServerResponse, body: string): void {
  res.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    // 数据每次启动重新生成，禁用缓存避免看到旧结果
    'cache-control': 'no-store',
  });
  res.end(body);
}

function sendText(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(body);
}

/** 数据接口：/api/data.json 是改动日历，/api/loc.json 是行数清单。 */
export function createApiMiddleware(payloads: Payloads): Middleware {
  return (req, res, next) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (pathname === '/api/data.json' || pathname === '/data.json') {
      sendJson(res, payloads.data);
      return;
    }
    if (pathname === '/api/loc.json' || pathname === '/loc.json') {
      sendJson(res, payloads.loc);
      return;
    }
    next();
  };
}

/** 静态资源：把构建产物目录当作站点根。 */
export function createStaticMiddleware(webDir: string): Middleware {
  return (req, res, next) => {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    let filePath = resolve(webDir, rel);
    if (filePath !== webDir && !filePath.startsWith(webDir + sep)) {
      sendText(res, 403, '禁止访问站点根目录之外的路径');
      return;
    }
    try {
      if (statSync(filePath).isDirectory()) {
        filePath = join(filePath, 'index.html');
        statSync(filePath);
      }
    } catch {
      next();
      return;
    }
    const { size } = statSync(filePath);
    res.writeHead(200, {
      'content-type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'content-length': size,
      'cache-control': 'no-store',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(filePath).pipe(res);
  };
}

export function compose(middlewares: readonly Middleware[]): Middleware {
  return (req, res, next) => {
    let index = 0;
    const step = (): void => {
      const middleware = middlewares[index];
      index += 1;
      if (!middleware) {
        next();
        return;
      }
      middleware(req, res, step);
    };
    step();
  };
}

export interface ServerHandle {
  port: number;
  url: string;
  close: () => void;
}

export interface ListenOptions {
  host: string;
  port: number;
  /** 端口被占用时最多向后尝试多少个端口。 */
  attempts?: number;
}

export function startServer(middleware: Middleware, opts: ListenOptions): Promise<ServerHandle> {
  const handler = compose([middleware]);
  const server = createServer((req, res) => {
    handler(req, res, () => sendText(res, 404, `未找到 ${req.url ?? '/'}`));
  });

  const listen = (port: number, left: number): Promise<number> =>
    new Promise((done, fail) => {
      const onError = (err: NodeJS.ErrnoException): void => {
        server.removeListener('error', onError);
        if (err.code === 'EADDRINUSE' && left > 0) {
          done(listen(port + 1, left - 1));
          return;
        }
        fail(err);
      };
      server.once('error', onError);
      server.listen(port, opts.host, () => {
        server.removeListener('error', onError);
        done(port);
      });
    });

  return listen(opts.port, opts.attempts ?? 10).then((port) => ({
    port,
    url: `http://${opts.host === '0.0.0.0' ? 'localhost' : opts.host}:${port}/`,
    close: () => server.close(),
  }));
}
