// ---------------------------------------------------------------------------
// 改动日历
// 用 git log --numstat 流式读出最近一段时间的提交，按文件的路径归属拆到各分组。
// 日期统一取 committer date，与 git log --since 的过滤口径一致；在子目录里运行时
// 加 --relative，路径与统计范围都和行数视图对齐。
// ---------------------------------------------------------------------------
import { execFileSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { firstMatch } from './glob.js';
import { createPathFilter, GIT_SAFE_CONFIG } from './scan.js';
import { repoName } from './util.js';
import type { CalendarData, CommitEntry, DayEntry, GroupDef, GroupStat, Profile } from './types.js';

const COMMIT_PREFIX = 'COMMIT|';

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

interface CalendarOptions {
  /** 统计最近多少天，0 表示全部历史。 */
  days: number;
}

/** 目录是否在 git 仓库内，用于提前给出可读的提示。 */
export function isGitRepo(root: string): boolean {
  try {
    const out = execFileSync('git', ['-C', root, ...GIT_SAFE_CONFIG, 'rev-parse', '--is-inside-work-tree'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim() === 'true';
  } catch {
    return false;
  }
}

/** 逐行读 git 的输出：历史很大时不会像一次性读入那样撞上 maxBuffer。 */
async function streamLines(args: readonly string[], onLine: (line: string) => void): Promise<void> {
  const child = spawn('git', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => {
    if (stderr.length < 4096) {
      stderr += chunk.toString('utf8');
    }
  });
  try {
    const done = new Promise<number | null>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', resolve);
    });
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    for await (const line of lines) {
      onLine(line);
    }
    const code = await done;
    if (code !== 0) {
      throw new Error(stderr.trim() || `git exited with code ${code}`);
    }
  } finally {
    child.kill();
  }
}

export async function buildCalendar(root: string, profile: Profile, opts: CalendarOptions): Promise<CalendarData> {
  const args = ['-C', root, ...GIT_SAFE_CONFIG, '-c', 'core.quotePath=false', 'log'];
  if (opts.days > 0) {
    args.push(`--since=${opts.days} days ago`);
  }
  args.push(
    '--relative',
    '--date=short',
    '--no-renames',
    `--pretty=format:${COMMIT_PREFIX}%cd|%h|%s`,
    '--numstat',
  );

  const counted = createPathFilter(profile.ignore);
  const days = new Map<string, DayEntry>();
  let current: { date: string; hash: string; subject: string; groups: Record<string, GroupStat> } | null = null;
  let currentGroups: Record<string, GroupStat> | null = null;
  let touched = false;

  const flush = (): void => {
    if (!current) {
      return;
    }
    const { date, groups, ...rest } = current;
    // 合并提交、空提交没有任何文件行，也要计入 all，
    // 否则统计卡的提交数与下方提交列表对不上
    if (!touched) {
      groups.all.commits = 1;
    }
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
    touched = false;
  };

  await streamLines(args, (line) => {
    if (line === '') {
      return;
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
      return;
    }
    const parts = line.split('\t');
    if (parts.length < 3 || !current || !currentGroups) {
      return;
    }
    const path = parts.slice(2).join('\t');
    if (!counted(path)) {
      // 与行数视图共用一套忽略口径，两个视图的分母才对得上
      return;
    }
    const add = parts[0] === '-' ? 0 : Number.parseInt(parts[0], 10);
    const del = parts[1] === '-' ? 0 : Number.parseInt(parts[1], 10);
    if (Number.isNaN(add) || Number.isNaN(del)) {
      return;
    }
    touched = true;
    const groupId = firstMatch(path, profile.groups);
    for (const id of groupId ? ['all', groupId] : ['all']) {
      const stat = currentGroups[id];
      stat.add += add;
      stat.del += del;
      // 同一个提交里改多个文件只算一次；改动行数为 0（二进制、仅改权限）也算改过
      stat.commits = 1;
    }
  });
  flush();

  const dates = [...days.keys()].sort();
  const totals = blankGroups(profile.groups);
  let maxVal = 1;
  let maxCommits = 1;
  for (const day of days.values()) {
    for (const [id, stat] of Object.entries(day.groups)) {
      totals[id].add += stat.add;
      totals[id].del += stat.del;
      totals[id].commits += stat.commits;
    }
    maxVal = Math.max(maxVal, day.groups.all.add, day.groups.all.del);
    maxCommits = Math.max(maxCommits, day.groups.all.commits);
  }

  return {
    generatedAt: new Date().toISOString(),
    root: repoName(root),
    profile: profile.name,
    groups: profile.groups.map(({ id, label, labelKey, hue, sat }) => ({ id, label, labelKey, hue, sat })),
    range: { min: dates[0] ?? '', max: dates[dates.length - 1] ?? '' },
    totals: { days: dates.length, groups: totals },
    maxVal,
    maxCommits,
    days: Object.fromEntries(dates.map((date) => [date, days.get(date)!])),
  };
}

/** git 不可用或目录不是仓库时的空日历，让页面的其余部分仍可用。 */
export function emptyCalendar(root: string, profile: Profile): CalendarData {
  return {
    generatedAt: new Date().toISOString(),
    root: repoName(root),
    profile: profile.name,
    groups: profile.groups.map(({ id, label, labelKey, hue, sat }) => ({ id, label, labelKey, hue, sat })),
    range: { min: '', max: '' },
    totals: { days: 0, groups: blankGroups(profile.groups) },
    maxVal: 1,
    maxCommits: 1,
    days: {},
  };
}
