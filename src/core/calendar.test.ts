import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { buildCalendar, emptyCalendar, resolveGroup } from './calendar.js';
import { DEFAULT_CATEGORIES } from './profile.js';
import type { Profile } from './types.js';

const dir = mkdtempSync(join(tmpdir(), 'codelens-calendar-'));
const PROFILE: Profile = {
  name: 'test',
  label: '测试',
  groups: [
    { id: 'frontend', label: '前端', hue: 268, sat: 46, match: ['frontend/**'] },
    { id: 'backend', label: '后端', hue: 214, sat: 58, match: ['**'] },
  ],
  categories: DEFAULT_CATEGORIES,
  ignore: [],
};

const lines = (n: number): string => `${Array.from({ length: n }, (_, i) => `line ${i}`).join('\n')}\n`;
const write = (rel: string, content: string): void => {
  const abs = join(dir, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
};
const git = (args: string[], date: string): void => {
  execFileSync('git', args, {
    cwd: dir,
    stdio: 'ignore',
    env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  });
};

git(['init', '-q'], '2020-01-02T03:04:05');
git(['config', 'user.email', 'test@example.com'], '2020-01-02T03:04:05');
git(['config', 'user.name', 'codelens'], '2020-01-02T03:04:05');

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

describe('resolveGroup', () => {
  test('[resolveGroup] 应该取第一个命中的分组', () => {
    expect(resolveGroup('frontend/a.ts', PROFILE.groups)).toBe('frontend');
    expect(resolveGroup('src/a.ts', PROFILE.groups)).toBe('backend');
  });

  test('[resolveGroup] 没有命中任何分组时应该返回 undefined', () => {
    expect(resolveGroup('src/a.ts', [PROFILE.groups[0]])).toBeUndefined();
    expect(resolveGroup('src/a.ts', [])).toBeUndefined();
  });
});

describe('buildCalendar', () => {
  const data = buildCalendar(dir, PROFILE, { days: 0 });

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

  test('[buildCalendar] 没有命中分组的文件只计入全部', () => {
    const narrow: Profile = {
      ...PROFILE,
      groups: [{ id: 'backend', label: '后端', hue: 214, sat: 58, match: ['src/**'] }],
    };
    const scoped = buildCalendar(dir, narrow, { days: 0 });
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

  test('[buildCalendar] 时间跨度之外的提交应该被排除', () => {
    const empty = buildCalendar(dir, PROFILE, { days: 7 });
    expect(empty.totals.days).toBe(0);
    expect(empty.range).toEqual({ min: '', max: '' });
  });

  test('[buildCalendar] 分组元信息应该原样带出', () => {
    expect(data.groups.map((group) => group.id)).toEqual(['frontend', 'backend']);
    expect(data.groups[0].label).toBe('前端');
    expect(data.root).toBe(dir.split(/[\\/]/).filter(Boolean).pop());
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
