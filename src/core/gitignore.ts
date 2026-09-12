// ---------------------------------------------------------------------------
// .gitignore 解析与匹配
// git 可用时直接由 git 过滤，这里的实现用于 git 缺失或非仓库目录的情形。
// 语义与 git 一致：后出现的规则覆盖先出现的，`!` 表示反向排除，
// 结尾 `/` 只匹配目录，含 `/` 的模式从所在目录锚定。
// ---------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { globToRegExp } from './glob.js';

export interface IgnoreRule {
  /** 规则所在目录，相对仓库根，根目录为空串。 */
  base: string;
  negate: boolean;
  dirOnly: boolean;
  re: RegExp;
}

function parseLine(raw: string, base: string): IgnoreRule | undefined {
  // 行尾未转义的空格在 gitignore 里被忽略
  const line = raw.replace(/(?<!\\)\s+$/, '');
  if (line === '' || line.startsWith('#')) {
    return undefined;
  }
  const negate = line.startsWith('!');
  let pattern = negate ? line.slice(1) : line;
  // 反斜杠加空格是转义的空格，还原成普通空格
  pattern = pattern.replace(/\\ /g, ' ');
  const dirOnly = pattern.endsWith('/');
  if (dirOnly) {
    pattern = pattern.slice(0, -1);
  }
  if (pattern === '') {
    return undefined;
  }
  // 开头的 `/` 表示从所在目录起算
  const anchored = pattern.startsWith('/');
  const body = anchored ? pattern.slice(1) : pattern;
  if (body === '') {
    return undefined;
  }
  return { base, negate, dirOnly, re: globToRegExp(body, base, anchored) };
}

/** 解析一段 .gitignore 文本，base 为该文件所在目录。 */
export function parseIgnoreText(text: string, base: string): IgnoreRule[] {
  const rules: IgnoreRule[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const rule = parseLine(raw, base);
    if (rule) {
      rules.push(rule);
    }
  }
  return rules;
}

/** 读取目录下的 .gitignore，不存在时返回空数组。 */
export function loadIgnoreFile(dir: string, base: string): IgnoreRule[] {
  try {
    return parseIgnoreText(readFileSync(join(dir, '.gitignore'), 'utf8'), base);
  } catch {
    return [];
  }
}

/** 从后往前找第一条命中的规则，决定路径是否被忽略。 */
export function isIgnored(relPath: string, isDir: boolean, rules: readonly IgnoreRule[]): boolean {
  for (let i = rules.length - 1; i >= 0; i -= 1) {
    const rule = rules[i];
    if (rule.dirOnly && !isDir) {
      continue;
    }
    if (rule.re.test(relPath)) {
      return !rule.negate;
    }
  }
  return false;
}
