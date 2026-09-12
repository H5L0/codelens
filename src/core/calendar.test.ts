import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { buildCalendar, emptyCalendar } from './calendar.js';
import { firstMatch } from './glob.js';
import { DEFAULT_CATEGORIES } from './profile.js';
import type { CalendarData, Profile } from './types.js';

const dir = mkdtempSync(join(tmpdir(), 'codelens-calendar-'));
const PROFILE: Profile = {
  name: 'test',
  label: '测试',
  groups: [
    { id: 'frontend', label: 'Frontend', labelKey: 'profile.frontend', hue: 268, sat: 46, match: ['frontend/**'] },
    { id: 'backend', label: 'Backend', hue: 214, sat: 58, match: ['**'] },
  ],
  categories: DEFAULT_CATEGORIES,
  ignore: [],
};

const lines = (n: number): string => `${Array.from({ length: n }, (_, i) => `line ${i}`).join('\n')}\n`;
const write = (rel: string, content: string | Buffer, base = dir): void => {
  const abs = join(base, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
};
const git = (args: string[], date: string, base = dir): void => {
  execFileSync('git', args, {
    cwd: base,
    stdio: 'ignore',
    env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  });
};
const initRepo = (base: string): void => {
  git(['init', '-q'], '2020-01-02T03:04:05', base);
  git(['config', 'user.email', 'test@example.com'], '2020-01-02T03:04:05', base);
  git(['config', 'user.name', 'codelens'], '2020-01-02T03:04:05', base);
};

initRepo(dir);
write('src/a.ts', lines(10));
write('frontend/b.tsx', lines(5));
write('docs/c.md', lines(3));
git(['add', '-A'], '2020-01-02T03:04:05');
git(['commit', '-q', '-m', 'first'], '2020-01-02T03:04:05');

// 第二个提交只在前端文件末尾追加 3 行
write('frontend/b.tsx', lines(8));
git(['add', '-A'], '2020-01-03T10:00:00');
git(['commit', '-q', '-m', 'second'], '2020-01-03T10:00:00');

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('firstMatch', () => {
  test('[firstMatch] 应该取第一个命中的分组', () => {
    expect(firstMatch('frontend/a.ts', PROFILE.groups)).toBe('frontend');
    expect(firstMatch('src/a.ts', PROFILE.groups)).toBe('backend');
  });

  test('[firstMatch] 没有命中任何分组时应该返回 undefined', () => {
    expect(firstMatch('src/a.ts', [PROFILE.groups[0]])).toBeUndefined();
    expect(firstMatch('src/a.ts', [])).toBeUndefined();
  });
});

describe('buildCalendar', () => {
  let data: CalendarData;

  beforeAll(async () => {
    data = await buildCalendar(dir, PROFILE, { days: 0 });
  });

  test('[buildCalendar] 应该按日期分组并给出区间与天数', () => {
    expect(data.range).toEqual({ min: '2020-01-02', max: '2020-01-03' });
    expect(data.totals.days).toBe(2);
    expect(Object.keys(data.days)).toEqual(['2020-01-02', '2020-01-03']);
  });

  test('[buildCalendar] 应该把文件改动拆到对应分组', () => {
    const first = data.days['2020-01-02'].groups;
    expect(first.all.add).toBe(18);
    // backend 用的是兜底模式 **，因此没被 frontend 命中的文件都算它
    expect(first.backend.add).toBe(13);
    expect(first.frontend.add).toBe(5);
    expect(first.backend.commits).toBe(1);
    expect(first.frontend.commits).toBe(1);
  });

  test('[buildCalendar] 同一个提交里改多个同组文件只计一次提交', () => {
    expect(data.totals.groups.backend.commits).toBe(1);
    expect(data.totals.groups.frontend.commits).toBe(2);
  });

  test('[buildCalendar] 没有命中分组的文件只计入全部', async () => {
    const narrow: Profile = {
      ...PROFILE,
      groups: [{ id: 'backend', label: '后端', hue: 214, sat: 58, match: ['src/**'] }],
    };
    const scoped = await buildCalendar(dir, narrow, { days: 0 });
    const first = scoped.days['2020-01-02'].groups;
    expect(first.all.add).toBe(18);
    expect(first.backend.add).toBe(10);
    expect(scoped.totals.groups.backend.commits).toBe(1);
  });

  test('[buildCalendar] 应该保留提交的哈希与说明', () => {
    const commits = data.days['2020-01-02'].commits;
    expect(commits).toHaveLength(1);
    expect(commits[0].subject).toBe('first');
    expect(commits[0].hash).toMatch(/^[0-9a-f]{7,}$/);
    expect(commits[0].groups.frontend.add).toBe(5);
    expect(commits[0].groups.backend.add).toBe(13);
  });

  test('[buildCalendar] maxVal 应该取单日改动行的峰值', () => {
    expect(data.maxVal).toBe(18);
  });

  test('[buildCalendar] maxCommits 应该取单日提交数的峰值', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'codelens-calendar-peak-'));
    initRepo(repo);
    for (const [name, date] of [
      ['src/a.ts', '2021-05-01T09:00:00'],
      ['src/b.ts', '2021-05-01T11:00:00'],
      ['src/c.ts', '2021-05-02T09:00:00'],
    ]) {
      write(name, lines(2), repo);
      git(['add', '-A'], date, repo);
      git(['commit', '-q', '-m', name], date, repo);
    }
    const peak = await buildCalendar(repo, PROFILE, { days: 0 });
    // 5 月 1 日两个提交、5 月 2 日一个：峰值是 2，改动行峰值仍是行数口径
    expect(peak.maxCommits).toBe(2);
    expect(peak.maxVal).toBe(4);
    rmSync(repo, { recursive: true, force: true });
  });

  test('[buildCalendar] 时间跨度之外的提交应该被排除', async () => {
    const empty = await buildCalendar(dir, PROFILE, { days: 7 });
    expect(empty.totals.days).toBe(0);
    expect(empty.range).toEqual({ min: '', max: '' });
  });

  test('[buildCalendar] 分组元信息应该原样带出', () => {
    expect(data.groups.map((group) => group.id)).toEqual(['frontend', 'backend']);
    expect(data.groups[0].label).toBe('Frontend');
    // labelKey 要一起下发给页面，页面才能按语言翻译内置分组
    expect(data.groups[0].labelKey).toBe('profile.frontend');
    expect(data.root).toBe(dir.split(/[\\/]/).filter(Boolean).pop());
  });
});

// ---------------------------------------------------------------------------
// 口径一致性：合并提交、二进制改动、忽略规则、子目录
// ---------------------------------------------------------------------------

describe('buildCalendar 的统计口径', () => {
  const repo = mkdtempSync(join(tmpdir(), 'codelens-scope-'));
  const SCOPE_PROFILE: Profile = {
    name: 'scope',
    label: 'scope',
    groups: [{ id: 'src', label: 'Source', hue: 214, sat: 58, match: ['**/*.ts'] }],
    categories: DEFAULT_CATEGORIES,
    ignore: ['other/**'],
  };

  beforeAll(() => {
    initRepo(repo);
    write('pkg/src/a.ts', lines(4), repo);
    write('other/b.ts', lines(4), repo);
    git(['add', '-A'], '2020-02-01T09:00:00', repo);
    git(['commit', '-q', '-m', 'base'], '2020-02-01T09:00:00', repo);

    // 二进制文件的 numstat 是 `- -`，改动行数为 0
    write('pkg/assets/logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]), repo);
    git(['add', '-A'], '2020-02-02T09:00:00', repo);
    git(['commit', '-q', '-m', 'binary'], '2020-02-02T09:00:00', repo);

    // 分支出一个提交再合并，合并提交本身没有任何 numstat 行
    git(['checkout', '-q', '-b', 'feature'], '2020-02-03T09:00:00', repo);
    write('pkg/src/b.ts', lines(6), repo);
    git(['add', '-A'], '2020-02-03T09:00:00', repo);
    git(['commit', '-q', '-m', 'feature'], '2020-02-03T09:00:00', repo);
    git(['checkout', '-q', '-'], '2020-02-04T09:00:00', repo);
    git(['merge', '--no-ff', '-q', '-m', 'merge feature', 'feature'], '2020-02-04T09:00:00', repo);

    // 只改了被忽略目录的提交
    write('other/b.ts', lines(6), repo);
    git(['add', '-A'], '2020-02-05T09:00:00', repo);
    git(['commit', '-q', '-m', 'other only'], '2020-02-05T09:00:00', repo);
  });

  afterAll(() => rmSync(repo, { recursive: true, force: true }));

  test('[buildCalendar] 二进制改动的提交要计入提交数', async () => {
    const data = await buildCalendar(repo, SCOPE_PROFILE, { days: 0 });
    const day = data.days['2020-02-02'];
    expect(day.groups.all.commits).toBe(1);
    expect(day.groups.all.add).toBe(0);
    expect(day.commits).toHaveLength(1);
  });

  test('[buildCalendar] 合并提交没有文件行也要计入全部', async () => {
    const data = await buildCalendar(repo, SCOPE_PROFILE, { days: 0 });
    const week = data.days['2020-02-04'];
    expect(week.commits.map((commit) => commit.subject)).toEqual(['merge feature']);
    expect(week.groups.all.commits).toBe(1);
    // 统计卡的提交数应当等于提交列表的长度
    const listed = Object.values(data.days).reduce((sum, day) => sum + day.commits.length, 0);
    expect(data.totals.groups.all.commits).toBe(listed);
  });

  test('[buildCalendar] 被忽略的目录不计入改动行', async () => {
    const ignored = await buildCalendar(repo, SCOPE_PROFILE, { days: 0 });
    const kept = await buildCalendar(repo, { ...SCOPE_PROFILE, ignore: [], groups: [] }, { days: 0 });
    // 只改 other/ 的那天：忽略后一行都不算，提交本身仍然列出
    expect(ignored.days['2020-02-05'].groups.all.add).toBe(0);
    expect(ignored.days['2020-02-05'].groups.all.commits).toBe(1);
    expect(kept.days['2020-02-05'].groups.all.add).toBe(2);
    expect(ignored.totals.groups.all.add).toBeLessThan(kept.totals.groups.all.add);
  });

  test('[buildCalendar] 在子目录里运行时只看该目录的改动', async () => {
    const whole = await buildCalendar(repo, { ...SCOPE_PROFILE, ignore: [] }, { days: 0 });
    const sub = await buildCalendar(join(repo, 'pkg'), SCOPE_PROFILE, { days: 0 });
    // 子目录只统计 pkg 下的 4 + 6 行，整仓库还多出 other/ 的改动
    expect(sub.totals.groups.all.add).toBe(4 + 6);
    expect(sub.totals.groups.all.add).toBeLessThan(whole.totals.groups.all.add);
    expect(sub.range.min).toBe(whole.range.min);
  });
});

describe('emptyCalendar', () => {
  test('[emptyCalendar] 应该给出可渲染的空日历', () => {
    const data = emptyCalendar('/tmp/demo', PROFILE);
    expect(data.range).toEqual({ min: '', max: '' });
    expect(data.totals.days).toBe(0);
    expect(data.maxVal).toBe(1);
    expect(data.days).toEqual({});
    expect(data.totals.groups.all).toEqual({ commits: 0, add: 0, del: 0 });
    expect(data.totals.groups.backend).toEqual({ commits: 0, add: 0, del: 0 });
    expect(data.root).toBe('demo');
  });
});
