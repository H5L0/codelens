// ---------------------------------------------------------------------------
// Glob 匹配
// 把仓库相对路径（posix 分隔）的 glob 编译成正则，分类、分组、忽略规则共用。
// 约定：`**` 跨目录，`*` 不跨目录，`?` 单个非分隔字符，`{a,b}` 择一；
// 模式不含 `/` 时匹配任意层级的同名文件，含 `/` 时从基准目录锚定。
// ---------------------------------------------------------------------------

const cache = new Map<string, RegExp>();

function escapeRe(ch: string): string {
  return /[.+^$()[\]{}|\\]/.test(ch) ? `\\${ch}` : ch;
}

function translate(pattern: string): string {
  let re = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        i += 1;
        if (pattern[i + 1] === '/') {
          i += 1;
          re += '(?:[^/]+/)*';
        } else {
          re += '.*';
        }
      } else {
        re += '[^/]*';
      }
      continue;
    }
    if (ch === '?') {
      re += '[^/]';
      continue;
    }
    if (ch === '{') {
      const close = pattern.indexOf('}', i + 1);
      if (close > i + 1) {
        const alts = pattern.slice(i + 1, close).split(',').map(translate).join('|');
        re += `(?:${alts})`;
        i = close;
        continue;
      }
    }
    re += escapeRe(ch);
  }
  return re;
}

/**
 * 把 glob 编译成正则。base 为模式所锚定的目录（相对仓库根，根目录传空串），
 * forceAnchored 用于 `/foo` 这类明确从基准目录起算的写法。
 */
export function globToRegExp(pattern: string, base = '', forceAnchored = false): RegExp {
  const key = `${base}\u0000${pattern}\u0000${forceAnchored ? '1' : '0'}`;
  const hit = cache.get(key);
  if (hit) {
    return hit;
  }
  const prefix = base ? `^${translate(base)}/` : '^';
  const body = translate(pattern);
  // 含 `/` 的模式整体锚定，否则允许出现在任意层级
  const anchored = forceAnchored || pattern.includes('/');
  const re = new RegExp(anchored ? `${prefix}${body}$` : `${prefix}(?:[^/]+/)*${body}$`);
  cache.set(key, re);
  return re;
}

/** 路径是否命中任意一个 glob。 */
export function matchesAny(path: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => globToRegExp(pattern).test(path));
}
