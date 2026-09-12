// ---------------------------------------------------------------------------
// Glob 匹配
// 把仓库相对路径（posix 分隔）的 glob 编译成线性时间的匹配函数，分类、分组、
// 忽略规则共用。约定：独立的 `**` 段跨目录，`*` 不跨目录，`?` 匹配单个非分隔
// 字符，`{a,b}` 择一；不含 `/` 的模式匹配基准目录下任意层级的同名项，
// 以 `/` 开头表示从基准目录锚定，以 `/` 结尾表示目录及其全部内容。
//
// 匹配按路径分段做记忆化递推，不用回溯正则：`**a` 反复出现的恶意模式
// （会被一个仓库自带的配置或 .gitignore 带进来）不会让进程卡住。
// ---------------------------------------------------------------------------

/** 编译后的匹配函数。 */
export type GlobMatcher = (path: string) => boolean;

/** 花括号展开的组合上限，超过就整体按字面量处理，避免配置撑爆内存。 */
const MAX_ALTERNATIVES = 256;

const cache = new Map<string, GlobMatcher>();

const NEVER: GlobMatcher = () => false;

/** 找到与 open 处 `{` 配对的 `}`，考虑嵌套。 */
function findClose(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') {
      depth += 1;
    } else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

/** 按顶层逗号切分 `{a,{b,c}}` 的内容，嵌套的花括号不切。 */
function splitAlternatives(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
    } else if (ch === ',' && depth === 0) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(body.slice(start));
  return parts;
}

/** 展开 `{a,b}` 择一写法；没有花括号或展开过多时原样返回。 */
export function expandBraces(pattern: string): string[] {
  const out: string[] = [];
  const walk = (text: string): void => {
    if (out.length > MAX_ALTERNATIVES) {
      return;
    }
    const open = text.indexOf('{');
    const close = open === -1 ? -1 : findClose(text, open);
    if (open === -1 || close === -1) {
      out.push(text);
      return;
    }
    const head = text.slice(0, open);
    const tail = text.slice(close + 1);
    for (const alt of splitAlternatives(text.slice(open + 1, close))) {
      walk(`${head}${alt}${tail}`);
    }
  };
  walk(pattern);
  return out.length > MAX_ALTERNATIVES ? [pattern] : out;
}

/**
 * 单个路径段的匹配：`*` 与 `?` 都不跨分隔符（段内本来也没有分隔符）。
 * 用双指针加单星号回溯，最坏 O(段长 × 模式长)，不会指数爆炸。
 */
function matchSegment(pattern: string, text: string): boolean {
  let p = 0;
  let t = 0;
  let star = -1;
  let mark = 0;
  while (t < text.length) {
    const ch = pattern[p];
    if (ch === '*') {
      star = p;
      mark = t;
      p += 1;
    } else if (ch === '?' || (ch !== undefined && ch === text[t])) {
      p += 1;
      t += 1;
    } else if (star !== -1) {
      p = star + 1;
      mark += 1;
      t = mark;
    } else {
      return false;
    }
  }
  while (pattern[p] === '*') {
    p += 1;
  }
  return p === pattern.length;
}

/** 逐段匹配，独立的 `**` 段吃掉任意多段路径。 */
function matchSegments(segments: readonly string[], path: string): boolean {
  const parts = path.split('/');
  const n = segments.length;
  const m = parts.length;
  const memo = new Map<number, boolean>();
  const step = (i: number, j: number): boolean => {
    if (i === n) {
      return j === m;
    }
    const key = i * (m + 1) + j;
    const hit = memo.get(key);
    if (hit !== undefined) {
      return hit;
    }
    let out: boolean;
    if (segments[i] === '**') {
      out = step(i + 1, j) || (j < m && step(i, j + 1));
    } else {
      out = j < m && matchSegment(segments[i], parts[j]) && step(i + 1, j + 1);
    }
    memo.set(key, out);
    return out;
  };
  return step(0, 0);
}

/**
 * 编译一个 glob。base 为模式所锚定的目录（相对仓库根，根目录传空串），
 * 通常用于 .gitignore：规则里的相对写法都从该文件所在目录起算。
 */
export function createGlob(pattern: string, base = ''): GlobMatcher {
  const key = `${base}\u0000${pattern}`;
  const hit = cache.get(key);
  if (hit) {
    return hit;
  }

  let body = pattern.startsWith('./') ? pattern.slice(2) : pattern;
  const anchored = body.startsWith('/');
  if (anchored) {
    body = body.slice(1);
  }
  const dirOnly = body.endsWith('/');
  if (dirOnly) {
    body = body.slice(0, -1);
  }

  let matcher: GlobMatcher = NEVER;
  if (body !== '') {
    const baseSegments = base === '' ? [] : base.split('/');
    // 不含 `/` 的模式可以出现在基准目录下的任意层级
    const anywhere = !anchored && !body.includes('/');
    const alternatives = expandBraces(body).map((variant) => {
      const segments = [...baseSegments];
      if (anywhere) {
        segments.push('**');
      }
      segments.push(...variant.split('/').filter((seg) => seg !== ''));
      if (dirOnly) {
        // 目录本身与它下面的一切都算命中
        segments.push('**');
      }
      return segments;
    });
    matcher = (path: string): boolean => alternatives.some((segments) => matchSegments(segments, path));
  }

  cache.set(key, matcher);
  return matcher;
}

/** 路径是否命中任意一个 glob。 */
export function matchesAny(path: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => createGlob(pattern)(path));
}

/** 带 glob 的定义（日历分组、行数分类共用）。 */
interface MatchDef {
  id: string;
  /** 命中任意 glob 即归入该定义；留空表示兜底，只在没有别的命中时采用。 */
  match?: readonly string[];
}

/**
 * 取第一个命中 `match` 的 id：按定义顺序，无 `match` 的定义记住、留作兜底，
 * 全都没有命中时用兜底，再没有就用 fallback。分组与分类的归属都走这一条规则。
 */
export function firstMatch(path: string, defs: readonly MatchDef[], fallback?: string): string | undefined {
  let empty: string | undefined;
  for (const def of defs) {
    if (!def.match || def.match.length === 0) {
      empty = def.id;
      continue;
    }
    if (matchesAny(path, def.match)) {
      return def.id;
    }
  }
  return empty ?? fallback;
}
