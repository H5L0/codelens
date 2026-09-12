// ---------------------------------------------------------------------------
// 行数统计
// 遍历仓库内应当统计的文件，逐个数行并按分类归档，产出树形图数据。
// 读文件用有限的并发；单个文件读失败只跳过它，不拖垮整次统计。
// ---------------------------------------------------------------------------
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { firstMatch } from './glob.js';
import { listFiles } from './scan.js';
import type { ScanResult, ScannedFile } from './scan.js';
import { repoName } from './util.js';
import type { CategoryDef, LocData, LocFileEntry, Profile } from './types.js';

/** 二进制与资源文件后缀，直接跳过。 */
const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.icns', '.svg',
  '.pdf', '.zip', '.tar', '.gz', '.tgz', '.bz2', '.7z', '.rar', '.xz', '.zst',
  '.wasm', '.node', '.so', '.dll', '.exe', '.dylib', '.a', '.o', '.obj',
  '.class', '.jar', '.pyc', '.pyo',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.mp3', '.mp4', '.mov', '.avi', '.mkv', '.webm', '.wav', '.ogg', '.flac',
  '.db', '.db-shm', '.db-wal', '.sqlite', '.sqlite3', '.bak',
  '.xls', '.xlsx', '.doc', '.docx', '.ppt', '.pptx', '.ods',
]);

/** 单文件上限，超过视为数据快照而非代码。 */
const MAX_BYTES = 3 * 1024 * 1024;

/** 同时打开的文件数，再高也超不过 node 的文件线程池。 */
const CONCURRENCY = 8;

interface LocOptions {
  useGitignore: boolean;
}

export interface LocResult {
  data: LocData;
  scan: ScanResult;
}

interface Skipped {
  binary: number;
  large: number;
  unreadable: number;
}

async function countFile(
  root: string,
  file: ScannedFile,
  categories: readonly CategoryDef[],
  skipped: Skipped,
): Promise<LocFileEntry | undefined> {
  const { path, size } = file;
  if (BINARY_EXT.has(extname(path).toLowerCase())) {
    skipped.binary += 1;
    return undefined;
  }
  if (size > MAX_BYTES) {
    skipped.large += 1;
    return undefined;
  }
  let content: string;
  try {
    content = await readFile(join(root, path), 'utf8');
  } catch {
    // 权限不足、被别的进程占用、读到一半被删：跳过这个文件就行
    skipped.unreadable += 1;
    return undefined;
  }
  if (content.includes('\0')) {
    skipped.binary += 1;
    return undefined;
  }
  const lines = content.split('\n');
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }
  if (lines.length === 0) {
    return undefined;
  }
  let nonBlank = 0;
  for (const line of lines) {
    if (line.trim() !== '') {
      nonBlank += 1;
    }
  }
  return { path, lines: lines.length, nonBlank, cat: firstMatch(path, categories, categories[0]?.id ?? 'app') ?? 'app' };
}

export async function buildLoc(root: string, profile: Profile, opts: LocOptions): Promise<LocResult> {
  const scan = listFiles({ root, ignore: profile.ignore, useGitignore: opts.useGitignore });
  const skipped: Skipped = { binary: 0, large: 0, unreadable: 0 };
  const counted: Array<LocFileEntry | undefined> = new Array<LocFileEntry | undefined>(scan.entries.length).fill(undefined);

  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = next;
      next += 1;
      const entry = scan.entries[index];
      if (!entry) {
        return;
      }
      counted[index] = await countFile(root, entry, profile.categories, skipped);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, scan.entries.length) }, worker));
  const files = counted.filter((file): file is LocFileEntry => file !== undefined);

  const sum = (pick: (f: LocFileEntry) => number): number => files.reduce((acc, f) => acc + pick(f), 0);
  return {
    data: {
      generatedAt: new Date().toISOString(),
      root: repoName(root),
      profile: profile.name,
      categories: profile.categories.map(({ id, label, labelKey, hue, sat, defaultOn }) => ({ id, label, labelKey, hue, sat, defaultOn })),
      totals: { files: files.length, lines: sum((f) => f.lines), nonBlank: sum((f) => f.nonBlank) },
      skipped,
      files,
    },
    scan,
  };
}

/** 统计失败时的空清单，让日历视图仍可打开。 */
export function emptyLoc(root: string, profile: Profile): LocData {
  return {
    generatedAt: new Date().toISOString(),
    root: repoName(root),
    profile: profile.name,
    categories: profile.categories.map(({ id, label, labelKey, hue, sat, defaultOn }) => ({ id, label, labelKey, hue, sat, defaultOn })),
    totals: { files: 0, lines: 0, nonBlank: 0 },
    skipped: { binary: 0, large: 0, unreadable: 0 },
    files: [],
  };
}
