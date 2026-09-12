// ---------------------------------------------------------------------------
// 改动日历
// 用 git log --numstat 取最近一段时间的提交，按文件的路径归属拆到各分组。
// ---------------------------------------------------------------------------
import { execFileSync } from 'node:child_process';
import { matchesAny } from './glob.js';
import { repoName } from './util.js';
import type { CalendarData, CommitEntry, DayEntry, GroupDef, GroupStat, Profile } from './types.js';

const COMMIT_PREFIX = 'COMMIT|';

/** 文件归入第一个命中的分组，没有命中的只计入 all。 */
export function resolveGroup(path: string, groups: readonly GroupDef[]): string | undefined {
  for (const group of groups) {
    if (matchesAny(path, group.match)) {
      return group.id;
    }
  }
  return undefined;
}

function emptyStats(): GroupStat {
  return { commits: 0, add: 0, del: 0 };
}

function blankGroups(groups: readonly GroupDef[]): Record<string, GroupStat> {
  const out: Record<string, GroupStat> = { all: emptyStats() };
  for (const group of groups) {
    out[group.id] = emptyStats();
  }
  return out;
}

export interface CalendarOptions {
  /** 统计最近多少天，0 表示全部历史。 */
  days: number;
}

/** 目录是否在 git 仓库内，用于提前给出可读的提示。 */
export function isGitRepo(root: string): boolean {
  try {
    const out = execFileSync('git', ['-C', root, 'rev-parse', '--is-inside-work-tree'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim() === 'true';
  } catch {
    return false;
  }
}

export function buildCalendar(root: string, profile: Profile, opts: CalendarOptions): CalendarData {
  const args = ['-C', root, '-c', 'core.quotePath=false', 'log'];
  if (opts.days > 0) {
    args.push(`--since=${opts.days} days ago`);
  }
  args.push('--date=short', '--no-renames', `--pretty=format:${COMMIT_PREFIX}%ad|%h|%s`, '--numstat');

  // stderr 单独收进错误对象，避免仓库不是 git 仓库时把 fatal 信息直接打到终端
  const raw = execFileSync('git', args, {
    maxBuffer: 256 * 1024 * 1024,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const days = new Map<string, DayEntry>();
  let current: { date: string; hash: string; subject: string; groups: Record<string, GroupStat> } | null = null;
  let currentGroups: Record<string, GroupStat> | null = null;

  const flush = (): void => {
    if (!current) {
      return;
    }
    const { date, groups, ...rest } = current;
    const entry: CommitEntry = { ...rest, groups };
    const day = days.get(date) ?? { commits: [], groups: blankGroups(profile.groups) };
    day.commits.push(entry);
    for (const [id, stat] of Object.entries(groups)) {
      const target = day.groups[id] ?? emptyStats();
      target.commits += stat.commits;
      target.add += stat.add;
      target.del += stat.del;
      day.groups[id] = target;
    }
    days.set(date, day);
    current = null;
    currentGroups = null;
  };

  for (const line of raw.split('\n')) {
    if (line === '') {
      continue;
    }
    if (line.startsWith(COMMIT_PREFIX)) {
      flush();
      const parts = line.slice(COMMIT_PREFIX.length).split('|');
      current = {
        date: parts[0],
        hash: parts[1],
        subject: parts.slice(2).join('|'),
        groups: blankGroups(profile.groups),
      };
      currentGroups = current.groups;
      continue;
    }
    const parts = line.split('\t');
    if (parts.length < 3 || !current || !currentGroups) {
      continue;
    }
    const add = parts[0] === '-' ? 0 : Number.parseInt(parts[0], 10);
    const del = parts[1] === '-' ? 0 : Number.parseInt(parts[1], 10);
    if (Number.isNaN(add) || Number.isNaN(del)) {
      continue;
    }
    const path = parts.slice(2).join('\t');
    const groupId = resolveGroup(path, profile.groups);
    for (const id of groupId ? ['all', groupId] : ['all']) {
      const stat = currentGroups[id];
      stat.add += add;
      stat.del += del;
      if (add + del > 0) {
        // 同一个提交里改多个文件只算一次提交
        stat.commits = 1;
      }
    }
  }
  flush();

  const dates = [...days.keys()].sort();
  const totals = blankGroups(profile.groups);
  let maxVal = 1;
  for (const day of days.values()) {
    for (const [id, stat] of Object.entries(day.groups)) {
      totals[id].add += stat.add;
      totals[id].del += stat.del;
      totals[id].commits += stat.commits;
    }
    maxVal = Math.max(maxVal, day.groups.all.add, day.groups.all.del);
  }

  return {
    generatedAt: new Date().toISOString(),
    root: repoName(root),
    profile: profile.name,
    groups: profile.groups.map(({ id, label, hue, sat }) => ({ id, label, hue, sat })),
    range: { min: dates[0] ?? '', max: dates[dates.length - 1] ?? '' },
    totals: { days: dates.length, groups: totals },
    maxVal,
    days: Object.fromEntries(dates.map((date) => [date, days.get(date)!])),
  };
}

/** git 不可用或目录不是仓库时的空日历，让页面的其余部分仍可用。 */
export function emptyCalendar(root: string, profile: Profile): CalendarData {
  return {
    generatedAt: new Date().toISOString(),
    root: repoName(root),
    profile: profile.name,
    groups: profile.groups.map(({ id, label, hue, sat }) => ({ id, label, hue, sat })),
    range: { min: '', max: '' },
    totals: { days: 0, groups: blankGroups(profile.groups) },
    maxVal: 1,
    days: {},
  };
}
