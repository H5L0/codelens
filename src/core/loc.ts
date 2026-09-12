// ---------------------------------------------------------------------------
// 行数统计
// 遍历仓库内应当统计的文件，逐个数行并按分类归档，产出树形图数据。
// ---------------------------------------------------------------------------
import { readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { matchesAny } from './glob.js';
import { listFiles } from './scan.js';
import type { ScanResult } from './scan.js';
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

/** 按配置顺序取第一个命中的分类，无 match 的分类作为兜底。 */
export function categorize(path: string, categories: readonly CategoryDef[]): string {
  let fallback = '';
  for (const category of categories) {
    if (!category.match || category.match.length === 0) {
      fallback = category.id;
      continue;
    }
    if (matchesAny(path, category.match)) {
      return category.id;
    }
  }
  return fallback || categories[0]?.id || 'app';
}

export interface LocOptions {
  useGitignore: boolean;
}

export interface LocResult {
  data: LocData;
  scan: ScanResult;
}

export function buildLoc(root: string, profile: Profile, opts: LocOptions): LocResult {
  const scan = listFiles({ root, ignore: profile.ignore, useGitignore: opts.useGitignore });
  const files: LocFileEntry[] = [];
  const skipped = { binary: 0, large: 0 };

  for (const path of scan.files) {
    const abs = join(root, path);
    if (BINARY_EXT.has(extname(path).toLowerCase())) {
      skipped.binary += 1;
      continue;
    }
    if (statSync(abs).size > MAX_BYTES) {
      skipped.large += 1;
      continue;
    }
    const content = readFileSync(abs, 'utf8');
    if (content.includes('\0')) {
      skipped.binary += 1;
      continue;
    }
    const lines = content.split('\n');
    if (lines[lines.length - 1] === '') {
      lines.pop();
    }
    if (lines.length === 0) {
      continue;
    }
    let nonBlank = 0;
    for (const line of lines) {
      if (line.trim() !== '') {
        nonBlank += 1;
      }
    }
    files.push({ path, lines: lines.length, nonBlank, cat: categorize(path, profile.categories) });
  }

  const sum = (pick: (f: LocFileEntry) => number): number => files.reduce((acc, f) => acc + pick(f), 0);
  return {
    data: {
      generatedAt: new Date().toISOString(),
      root: repoName(root),
      profile: profile.name,
      categories: profile.categories.map(({ id, label, hue, sat, defaultOn }) => ({ id, label, hue, sat, defaultOn })),
      totals: { files: files.length, lines: sum((f) => f.lines), nonBlank: sum((f) => f.nonBlank) },
      skipped,
      files,
    },
    scan,
  };
}
