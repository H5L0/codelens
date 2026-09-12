#!/usr/bin/env node
// ---------------------------------------------------------------------------
// codelens 命令行入口
// 解析参数 -> 按 .gitignore 列出仓库文件并统计行数 -> 读取 git 历史 -> 启动本地服务。
// ---------------------------------------------------------------------------
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildCalendar, emptyCalendar, isGitRepo } from '../core/calendar.js';
import { buildLoc, emptyLoc } from '../core/loc.js';
import type { LocResult } from '../core/loc.js';
import { loadProfile } from '../core/profile.js';
import type { CalendarData, Profile } from '../core/types.js';
import { helpText, parseArgs } from './args.js';
import { startDevServer } from './dev.js';
import { packageRoot, webDir } from './paths.js';
import { compose, createApiMiddleware, createStaticMiddleware, isLoopbackHost, startServer } from './server.js';

const f = (n: number): string => n.toLocaleString();

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

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

/** 左侧标签统一宽度，让多行输出对齐。 */
const LABEL_COL = 10;

const tag = (name: string): string => name.padEnd(LABEL_COL);

function log(label: string, text: string): void {
  console.log(`${tag(label)}${text}`);
}

/** git 不可用或目录不是仓库时保留空日历，让行数视图仍能打开。 */
async function readCalendar(root: string, profile: Profile, days: number): Promise<CalendarData> {
  if (!isGitRepo(root)) {
    console.warn(`${tag('warn')}directory is not inside a git repository, the calendar will be empty`);
    return emptyCalendar(root, profile);
  }
  try {
    return await buildCalendar(root, profile, { days });
  } catch (err) {
    console.warn(`${tag('warn')}failed to read git history, the calendar will be empty: ${message(err)}`);
    return emptyCalendar(root, profile);
  }
}

/** 行数统计失败时保留空清单，日历视图仍能打开。 */
async function readLoc(root: string, profile: Profile, useGitignore: boolean): Promise<LocResult> {
  try {
    return await buildLoc(root, profile, { useGitignore });
  } catch (err) {
    console.warn(`${tag('warn')}failed to count lines, the line view will be empty: ${message(err)}`);
    return { data: emptyLoc(root, profile), scan: { entries: [], mode: 'walk' } };
  }
}

function launchBrowser(url: string): void {
  const cmd =
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] :
    process.platform === 'darwin' ? ['open', [url]] :
    ['xdg-open', [url]];
  try {
    const child = spawn(cmd[0] as string, cmd[1] as string[], { stdio: 'ignore', detached: true });
    // 没有可用的打开方式（例如 linux 上缺 xdg-open）时不该抛未捕获异常
    child.on('error', () => {});
    child.unref();
  } catch {
    // 打不开浏览器不影响服务本身
  }
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
    throw new Error(`directory does not exist: ${root}`);
  }

  const profile = loadProfile({
    root,
    name: args.profile,
    configPath: args.config,
    exclude: args.exclude,
  });

  console.log(`codelens ${version()}`);
  log('repo', root);
  log('profile', `${profile.name} (${profile.label})${profile.configPath ? ` · ${profile.configPath}` : ''}`);

  const loc = await readLoc(root, profile, args.useGitignore);
  const scanLabel = loc.scan.mode === 'git' ? 'git index, filtered by .gitignore' : 'directory walk';
  log('files', `${f(loc.data.totals.files)} files · ${f(loc.data.totals.lines)} lines (${scanLabel})`);
  if (loc.data.skipped.unreadable > 0) {
    log('warn', `${f(loc.data.skipped.unreadable)} files could not be read and were skipped`);
  }
  if (profile.groups.length > 0) {
    log('groups', profile.groups.map((group) => `${group.label}=${group.match.join(' ')}`).join('  '));
  }

  const calendar = await readCalendar(root, profile, args.days);
  log(
    'calendar',
    calendar.range.min
      ? `${calendar.range.min} ~ ${calendar.range.max} · ${calendar.totals.days} days with commits`
      : 'no commits in this range',
  );

  if (args.dump) {
    const outDir = resolve(args.dump);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'data.json'), JSON.stringify(calendar));
    writeFileSync(join(outDir, 'loc.json'), JSON.stringify(loc.data));
    log('export', join(outDir, 'data.json'));
    log('', join(outDir, 'loc.json'));
    return;
  }

  const payloads = { data: JSON.stringify(calendar), loc: JSON.stringify(loc.data) };

  if (!isLoopbackHost(args.host)) {
    console.warn(`${tag('warn')}listening on ${args.host}, the dashboard is reachable from other machines`);
  }

  if (args.dev) {
    const dev = await startDevServer(payloads, { host: args.host, port: args.port });
    log('server', `${dev.url} (Vite dev mode, front-end changes apply instantly)`);
    if (args.open) {
      launchBrowser(dev.url);
    }
    process.on('SIGINT', () => {
      void dev.close().then(() => process.exit(0));
    });
    return;
  }

  const dir = webDir();
  if (!exists(join(dir, 'index.html'))) {
    throw new Error(`front-end build not found at ${dir}; run npm run build or use --dev`);
  }
  const server = await startServer(compose([createApiMiddleware(payloads), createStaticMiddleware(dir)]), {
    host: args.host,
    port: args.port,
  });
  log('server', server.url);
  if (args.open) {
    launchBrowser(server.url);
  }
  process.on('SIGINT', () => {
    server.close();
    process.exit(0);
  });
}

main().catch((err: unknown) => {
  console.error(`${tag('error')}${message(err)}`);
  process.exit(1);
});
