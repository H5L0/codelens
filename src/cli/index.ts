#!/usr/bin/env node
// ---------------------------------------------------------------------------
// codelens 命令行入口
// 解析参数 -> 按 .gitignore 列出仓库文件并统计行数 -> 读取 git 历史 -> 启动本地服务。
// ---------------------------------------------------------------------------
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildCalendar, emptyCalendar, isGitRepo } from '../core/calendar.js';
import { buildLoc } from '../core/loc.js';
import { loadProfile } from '../core/profile.js';
import type { CalendarData, Profile } from '../core/types.js';
import { helpText, parseArgs } from './args.js';
import { startDevServer } from './dev.js';
import { packageRoot, webDir } from './paths.js';
import { compose, createApiMiddleware, createStaticMiddleware, startServer } from './server.js';

const f = (n: number): string => n.toLocaleString();

function version(): string {
  const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as { version?: string };
  return pkg.version ?? '0.0.0';
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function exists(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

function log(label: string, text: string): void {
  console.log(`${label.padEnd(6)}${text}`);
}

/** git 不可用或目录不是仓库时保留空日历，让行数视图仍能打开。 */
function readCalendar(root: string, profile: Profile, days: number): CalendarData {
  if (!isGitRepo(root)) {
    console.warn('警告  目录不在 git 仓库中，改动日历将为空');
    return emptyCalendar(root, profile);
  }
  try {
    return buildCalendar(root, profile, { days });
  } catch (err) {
    console.warn(`警告  读取 git 历史失败，改动日历将为空：${err instanceof Error ? err.message : String(err)}`);
    return emptyCalendar(root, profile);
  }
}

function launchBrowser(url: string): void {
  const cmd =
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] :
    process.platform === 'darwin' ? ['open', [url]] :
    ['xdg-open', [url]];
  spawn(cmd[0] as string, cmd[1] as string[], { stdio: 'ignore', detached: true }).unref();
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(helpText());
    return;
  }
  if (args.version) {
    console.log(version());
    return;
  }

  const root = resolve(args.dir === '' ? process.cwd() : args.dir);
  if (!isDirectory(root)) {
    throw new Error(`目录不存在：${root}`);
  }

  const profile = loadProfile({
    root,
    name: args.profile,
    configPath: args.config,
    exclude: args.exclude,
  });

  console.log(`codelens ${version()}`);
  log('仓库', root);
  log('配置档', `${profile.name}（${profile.label}）${profile.configPath ? ` · ${profile.configPath}` : ''}`);

  const loc = buildLoc(root, profile, { useGitignore: args.useGitignore });
  const scanLabel = loc.scan.mode === 'git' ? 'git 索引，按 .gitignore 过滤' : '目录遍历';
  log('文件', `${f(loc.data.totals.files)} 个 · ${f(loc.data.totals.lines)} 行（${scanLabel}）`);
  if (profile.groups.length > 0) {
    log('分组', profile.groups.map((group) => `${group.label}=${group.match.join(' ')}`).join('　'));
  }

  const calendar = readCalendar(root, profile, args.days);
  log(
    '日历',
    calendar.range.min
      ? `${calendar.range.min} ~ ${calendar.range.max} · ${calendar.totals.days} 天有提交`
      : '该时间范围内没有提交',
  );

  if (args.dump) {
    const outDir = resolve(args.dump);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'data.json'), JSON.stringify(calendar));
    writeFileSync(join(outDir, 'loc.json'), JSON.stringify(loc.data));
    log('导出', join(outDir, 'data.json'));
    log('', join(outDir, 'loc.json'));
    return;
  }

  const payloads = { data: JSON.stringify(calendar), loc: JSON.stringify(loc.data) };

  if (args.dev) {
    const dev = await startDevServer(payloads, { host: args.host, port: args.port });
    log('服务', `${dev.url}（Vite 开发模式，前端改动即时生效）`);
    if (args.open) {
      launchBrowser(dev.url);
    }
    process.on('SIGINT', () => {
      void dev.close().then(() => process.exit(0));
    });
    return;
  }

  const dir = webDir(false);
  if (!exists(join(dir, 'index.html'))) {
    throw new Error(`未找到前端构建产物 ${dir}，请先执行 npm run build，或改用 --dev`);
  }
  const server = await startServer(compose([createApiMiddleware(payloads), createStaticMiddleware(dir)]), {
    host: args.host,
    port: args.port,
  });
  log('服务', server.url);
  if (args.open) {
    launchBrowser(server.url);
  }
  process.on('SIGINT', () => {
    server.close();
    process.exit(0);
  });
}

main().catch((err: unknown) => {
  console.error(`错误  ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
