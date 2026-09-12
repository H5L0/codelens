// ---------------------------------------------------------------------------
// 文件枚举
// 优先用 git 的索引加未跟踪文件列表，天然遵守 .gitignore（含全局与 .git/info/exclude）；
// git 缺失或目录不是仓库时退回递归遍历，用同一套 gitignore 语义自行过滤。
// ---------------------------------------------------------------------------
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { matchesAny } from './glob.js';
import { isIgnored, loadIgnoreFile } from './gitignore.js';
import type { IgnoreRule } from './gitignore.js';

export interface ScanOptions {
  root: string;
  /** 在 .gitignore 之外额外忽略的路径 glob。 */
  ignore: string[];
  /** 是否按 .gitignore 过滤，关闭后只跳过内置的重目录。 */
  useGitignore: boolean;
}

export interface ScanResult {
  /** 仓库相对路径，posix 分隔，已排序。 */
  files: string[];
  /** git 表示来自 git 索引，walk 表示自行遍历。 */
  mode: 'git' | 'walk';
}

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

function keep(path: string, ignore: readonly string[]): boolean {
  if (path.split('/').some((seg) => SKIP_DIRS.has(seg))) {
    return false;
  }
  return !matchesAny(path, ignore);
}

function listViaGit(root: string): string[] | undefined {
  try {
    const out = execFileSync(
      'git',
      ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
      { maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return out.toString('utf8').split('\0').filter(Boolean);
  } catch {
    // 不是仓库或 git 不可用时退回遍历
    return undefined;
  }
}

function walk(root: string, opts: ScanOptions): string[] {
  const files: string[] = [];

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
        // 不按 gitignore 过滤时沿用习惯做法：跳过除 .github 以外的隐藏目录
        if (!opts.useGitignore && ent.name.startsWith('.') && ent.name !== '.github') {
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
      files.push(rel);
    }
  };

  visit(root, '', []);
  return files;
}

/** 列出仓库内应当统计的文件。 */
export function listFiles(opts: ScanOptions): ScanResult {
  if (opts.useGitignore) {
    const viaGit = listViaGit(opts.root);
    if (viaGit) {
      const files = viaGit
        .filter((path) => keep(path, opts.ignore))
        .filter((path) => {
          try {
            return statSync(join(opts.root, path)).isFile();
          } catch {
            // 索引里有、磁盘上已被删除的文件
            return false;
          }
        });
      files.sort();
      return { files, mode: 'git' };
    }
  }
  const files = walk(opts.root, opts)
    .filter((path) => keep(path, opts.ignore))
    .sort();
  return { files, mode: 'walk' };
}
