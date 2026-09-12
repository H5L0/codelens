import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { afterAll, describe, expect, test, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { compose, createApiMiddleware, createStaticMiddleware, displayHost, isLoopbackHost, startServer } from './server.js';
import type { Middleware, Payloads } from './server.js';

const root = mkdtempSync(join(tmpdir(), 'codelens-server-'));
const outside = mkdtempSync(join(tmpdir(), 'codelens-outside-'));
mkdirSync(join(root, 'assets'));
writeFileSync(join(root, 'index.html'), '<!doctype html><title>codelens</title>');
writeFileSync(join(root, 'assets', 'app.js'), 'console.log(1)');
writeFileSync(join(root, 'assets', 'index.html'), '<!doctype html><title>assets</title>');
writeFileSync(join(outside, 'secret.txt'), 'secret');
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

interface Captured {
  status?: number;
  headers?: Record<string, unknown>;
  body?: string;
}

const fakeRequest = (url: string, method = 'GET'): IncomingMessage => ({ url, method }) as unknown as IncomingMessage;

/** 能接住 pipe 的假响应：body 走 Writable，writeHead 单独记录。 */
const fakeResponse = (out: Captured): ServerResponse => {
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      out.body = (out.body ?? '') + chunk.toString('utf8');
      done();
    },
  });
  const res = stream as unknown as { writeHead: (status: number, headers?: Record<string, unknown>) => unknown };
  res.writeHead = (status, headers) => {
    out.status = status;
    out.headers = headers;
    return stream;
  };
  return stream as unknown as ServerResponse;
};

const run = async (
  middleware: Middleware,
  url: string,
  method = 'GET',
): Promise<Captured & { passed: boolean }> => {
  const out: Captured = {};
  let passed = false;
  const res = fakeResponse(out);
  middleware(fakeRequest(url, method), res, () => {
    passed = true;
  });
  if (out.status !== undefined) {
    // 写出去的 body 走的是文件流，等它结束再断言
    await Promise.race([
      new Promise<void>((done) => (res as unknown as Writable).on('finish', () => done())),
      new Promise<void>((done) => setTimeout(done, 500)),
    ]);
  }
  return { ...out, passed };
};

const payloads: Payloads = { data: '{"days":{}}', loc: '{"files":[]}' };

describe('数据接口', () => {
  const api = createApiMiddleware(payloads);

  test('[createApiMiddleware] 两个接口都返回 json', async () => {
    for (const [url, body] of [['/api/data.json', payloads.data], ['/api/loc.json', payloads.loc]]) {
      const out = await run(api, url);
      expect(out.status).toBe(200);
      expect(out.body).toBe(body);
      expect(out.headers?.['content-type']).toBe('application/json; charset=utf-8');
      expect(out.passed).toBe(false);
    }
  });

  test('[createApiMiddleware] 其他路径交给下一个中间件', async () => {
    const out = await run(api, '/index.html');
    expect(out.passed).toBe(true);
    expect(out.status).toBeUndefined();
  });

  test('[createApiMiddleware] 畸形的 URL 不应该让请求抛异常', async () => {
    for (const url of ['/%', '/%zz', '/%E0%A4%A']) {
      const out = await run(api, url);
      // 不是接口路径，交给下一个中间件
      expect(out.passed).toBe(true);
    }
  });
});

describe('静态资源', () => {
  const statics = createStaticMiddleware(root);

  test('[createStaticMiddleware] 根路径返回 index.html', async () => {
    const out = await run(statics, '/');
    expect(out.status).toBe(200);
    expect(out.headers?.['content-type']).toBe('text/html; charset=utf-8');
    expect(out.body).toContain('codelens');
  });

  test('[createStaticMiddleware] 目录请求补上 index.html', async () => {
    const out = await run(statics, '/assets/');
    expect(out.status).toBe(200);
    expect(out.body).toContain('assets');
  });

  test('[createStaticMiddleware] 找不到的文件交给下一个中间件', async () => {
    expect((await run(statics, '/nope.js')).passed).toBe(true);
  });

  test('[createStaticMiddleware] 畸形 URL 返回 400 而不是抛异常', async () => {
    for (const url of ['/%', '/%zz', '/%E0%A4%A', '/a/%E0%A4%A.js']) {
      const out = await run(statics, url);
      expect(out.status).toBe(400);
      expect(out.passed).toBe(false);
    }
  });

  test('[createStaticMiddleware] 编码过的路径穿越应该被挡住', async () => {
    // %2e%2e%2f 解码后是 ../，不能读到站点根之外
    const out = await run(statics, '/%2e%2e%2fsecret.txt');
    expect(out.status).toBe(403);
    expect(out.body).toContain('path escapes');
  });

  test('[createStaticMiddleware] HEAD 请求只回头不回体', async () => {
    const out = await run(statics, '/index.html', 'HEAD');
    expect(out.status).toBe(200);
    expect(out.body).toBeUndefined();
    expect(out.passed).toBe(false);
  });
});

describe('compose', () => {
  test('[compose] 依次执行到最后一个中间件', () => {
    const order: string[] = [];
    const middle: Middleware[] = [0, 1, 2].map((index) => (_req, _res, next) => {
      order.push(String(index));
      next();
    });
    compose([
      ...middle,
      (_req, _res, next) => {
        order.push('end');
        next();
      },
    ])(fakeRequest('/'), fakeResponse({}), () => order.push('final'));
    expect(order).toEqual(['0', '1', '2', 'end', 'final']);
  });
});

describe('监听地址', () => {
  test('[displayHost] 监听全部网卡时换成本机地址，IPv6 补方括号', () => {
    expect(displayHost('0.0.0.0')).toBe('localhost');
    expect(displayHost('::')).toBe('localhost');
    expect(displayHost('127.0.0.1')).toBe('127.0.0.1');
    expect(displayHost('::1')).toBe('[::1]');
  });

  test('[isLoopbackHost] 只有本机地址算回环', () => {
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('localhost')).toBe(true);
    expect(isLoopbackHost('0.0.0.0')).toBe(false);
    expect(isLoopbackHost('192.168.1.20')).toBe(false);
  });

  test('[startServer] 端口被占用时顺延，起得来的服务能正常响应', async () => {
    const handler: Middleware = (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
    };
    const first = await startServer(handler, { host: '127.0.0.1', port: 0 });
    const second = await startServer(handler, { host: '127.0.0.1', port: first.port, attempts: 2 });
    try {
      expect(second.port).toBe(first.port + 1);
      expect(second.url).toContain(`:${second.port}/`);
      const fetched = await fetch(second.url);
      expect(await fetched.text()).toBe('ok');
    } finally {
      second.close();
      first.close();
    }
  });

  test('[startServer] 监听不了的地址应该报错', async () => {
    const handler: Middleware = vi.fn();
    await expect(startServer(handler, { host: '256.256.256.256', port: 0, attempts: 0 })).rejects.toThrow();
  });
});
