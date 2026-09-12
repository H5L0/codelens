// ---------------------------------------------------------------------------
// 文件枚举
// 优先用 git 的索引加未跟踪文件列表，天然遵守 .gitignore（含全局与 .git/info/exclude）；
// git 缺失或目录不是仓库时退回递归遍历，用同一套 gitignore 语义自行过滤。
// 枚举时顺手取回文件大小，行数统计不必再 stat 一遍。
// ---------------------------------------------------------------------------
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createGlob } from './glob.js';
import { isIgnored, loadIgnoreFile } from './gitignore.js';
import type { IgnoreRule } from './gitignore.js';

interface ScanOptions {
  root: string;
  /** 在 .gitignore 之外额外忽略的路径 glob。 */
  ignore: string[];
  /** 是否按 .gitignore 过滤，关闭后只跳过内置的重目录。 */
  useGitignore: boolean;
}

/** 枚举结果中的一个文件：仓库相对路径与字节大小。 */
export interface ScannedFile {
  path: string;
  size: number;
}

export interface ScanResult {
  /** 仓库相对路径，posix 分隔，已排序。 */
  entries: ScannedFile[];
  /** git 表示来自 git 索引，walk 表示自行遍历。 */
  mode: 'git' | 'walk';
}

/** git 调用统一关掉可能执行外部程序的配置，扫描不受信任的目录时更安全。 */
export const GIT_SAFE_CONFIG = ['-c', 'core.fsmonitor=false', '-c', 'log.showSignature=false'];

/** 依赖、构建产物与虚拟环境目录，任何模式下都跳过。 */
const SKIP_DIRS = new Set([
  '.git', '.hg', '.svn',
  'node_modules', 'bower_components', 'jspm_packages',
  'dist', 'build', 'out', 'coverage', 'vendor', 'target',
  '__pycache__', '.venv', 'venv', '.tox', '.pytest_cache', '.mypy_cache', '.ruff_cache',
  '.next', '.nuxt', '.svelte-kit', '.angular', '.turbo', '.parcel-cache', '.vite', '.vitest',
  '.cache', '.gradle', '.m2', '.cargo', '.terraform', '.dart_tool', '.stack-work',
  '.idea', '.vscode', 'tmp', 'temp',
]);

type PathFilter = (path: string) => boolean;

/**
 * 生成「这个路径要统计吗」的判定。除文件名外的任一段命中 SKIP_DIRS 就跳过
 * （目录名与文件同名的情形按文件保留），命中忽略 glob 的目录连同内容一起跳过：
 * `--exclude mydata` 与 `--exclude mydata/` 都能排除 mydata 下的全部文件。
 */
export function createPathFilter(ignore: readonly string[]): PathFilter {
  if (ignore.length === 0) {
    return (path: string): boolean => !path.split('/').slice(0, -1).some((seg) => SKIP_DIRS.has(seg));
  }
  const matchers = ignore.map((pattern) => createGlob(pattern));
  const dirCache = new Map<string, boolean>();
  const ignoredDir = (dir: string): boolean => {
    const hit = dirCache.get(dir);
    if (hit !== undefined) {
      return hit;
    }
    const value = matchers.some((matcher) => matcher(dir));
    dirCache.set(dir, value);
    return value;
  };
  return (path: string): boolean => {
    const parts = path.split('/');
    const dirs = parts.slice(0, -1);
    if (dirs.some((seg) => SKIP_DIRS.has(seg))) {
      return false;
    }
    let prefix = '';
    for (const dir of dirs) {
      prefix = prefix ? `${prefix}/${dir}` : dir;
      if (ignoredDir(prefix)) {
        return false;
      }
    }
    return !matchers.some((matcher) => matcher(path));
  };
}

function listViaGit(root: string): string[] | undefined {
  try {
    const out = execFileSync(
      'git',
      ['-C', root, ...GIT_SAFE_CONFIG, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
      { maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return out.toString('utf8').split('\0').filter(Boolean);
  } catch {
    // 不是仓库或 git 不可用时退回遍历
    return undefined;
  }
}

function walk(root: string, opts: ScanOptions): ScannedFile[] {
  const files: ScannedFile[] = [];

  const visit = (dir: string, relDir: string, rules: IgnoreRule[]): void => {
    const scoped = opts.useGitignore ? [...rules, ...loadIgnoreFile(dir, relDir)] : rules;
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      if (ent.isSymbolicLink() || (!ent.isDirectory() && !ent.isFile())) {
        continue;
      }
      const rel = relDir ? `${relDir}/${ent.name}` : ent.name;
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(ent.name)) {
          continue;
        }
        if (opts.useGitignore && isIgnored(rel, true, scoped)) {
          continue;
        }
        visit(join(dir, ent.name), rel, scoped);
        continue;
      }
      if (opts.useGitignore && isIgnored(rel, false, scoped)) {
        continue;
      }
      const stat = statSync(join(dir, ent.name), { throwIfNoEntry: false });
      if (stat?.isFile()) {
        files.push({ path: rel, size: stat.size });
      }
    }
  };

  visit(root, '', []);
  return files;
}

/** 列出仓库内应当统计的文件。 */
export function listFiles(opts: ScanOptions): ScanResult {
  const keep = createPathFilter(opts.ignore);
  if (opts.useGitignore) {
    const viaGit = listViaGit(opts.root);
    if (viaGit) {
      const entries: ScannedFile[] = [];
      for (const path of viaGit) {
        if (!keep(path)) {
          continue;
        }
        // 索引里可能残留磁盘上已删除的文件
        const stat = statSync(join(opts.root, path), { throwIfNoEntry: false });
        if (stat?.isFile()) {
          entries.push({ path, size: stat.size });
        }
      }
      entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
      return { entries, mode: 'git' };
    }
  }
  const entries = walk(opts.root, opts).filter((entry) => keep(entry.path));
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { entries, mode: 'walk' };
}
