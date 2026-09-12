// ---------------------------------------------------------------------------
// 开发服务器
// 用 Vite 托管前端源码并复用同一套数据接口，改动前端代码即时生效。
// ---------------------------------------------------------------------------
import { resolve } from 'node:path';
import { packageRoot } from './paths.js';
import { createApiMiddleware } from './server.js';
import type { Payloads } from './server.js';

export interface DevHandle {
  url: string;
  close: () => Promise<void>;
}

export interface DevOptions {
  host: string;
  port: number;
}

export async function startDevServer(payloads: Payloads, opts: DevOptions): Promise<DevHandle> {
  let vite: typeof import('vite');
  try {
    vite = await import('vite');
  } catch {
    throw new Error('dev mode requires vite; run npm install inside the package directory and retry');
  }

  const server = await vite.createServer({
    configFile: resolve(packageRoot, 'vite.config.ts'),
    server: { host: opts.host, port: opts.port, strictPort: false, open: false },
    plugins: [
      {
        name: 'codelens-api',
        configureServer(viteServer) {
          viteServer.middlewares.use(createApiMiddleware(payloads));
        },
      },
    ],
  });
  await server.listen();

  return {
    url: server.resolvedUrls?.local?.[0] ?? `http://${opts.host}:${opts.port}/`,
    close: () => server.close(),
  };
}
