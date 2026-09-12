// ---------------------------------------------------------------------------
// 配置档
// --profile 选择一份配置：内置的 all（不区分）与 web（常见前后端目录），
// 或在 codelens.config.json（也可用 --profile 直接指向 json 文件）里自定义，
// 用 groups 划分前后端等分组，用 categories 划分模块与文件类别。
// 内置项的 label 是英文，labelKey 供页面按语言覆盖；用户配置的 label 原样使用。
// ---------------------------------------------------------------------------
import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { CategoryDef, Profile } from './types.js';

// ---------------------------------------------------------------------------
// 默认分类
// 未配置 categories 时按这套规则划分，顺序即优先级，最后一项是兜底类。
// ---------------------------------------------------------------------------

export const DEFAULT_CATEGORIES: CategoryDef[] = [
  {
    id: 'test',
    label: 'Tests',
    labelKey: 'category.test',
    hue: 152,
    sat: 46,
    match: [
      '**/*.{test,spec}.{ts,tsx,js,jsx,mts,cts,mjs,cjs}',
      '**/{test,spec}.{ts,tsx,js,jsx,mts,cts,mjs,cjs}',
      '**/__tests__/**',
      '**/tests/**',
    ],
  },
  {
    id: 'generated',
    label: 'Generated',
    labelKey: 'category.generated',
    hue: 220,
    sat: 8,
    defaultOn: false,
    match: [
      'src/generated/**',
      '**/*.min.js',
      '**/*.map',
      '**/*lock.json',
      '**/*lock.yaml',
      '**/*.lock',
      '**/*.schema.json',
      '**/.dep-baseline.json',
    ],
  },
  { id: 'script', label: 'Scripts', labelKey: 'category.script', hue: 32, sat: 62, match: ['scripts/**'] },
  {
    id: 'doc',
    label: 'Docs',
    labelKey: 'category.doc',
    hue: 268,
    sat: 46,
    defaultOn: false,
    match: ['**/*.{md,mdx,txt,rst}', 'doc/**', 'docs/**'],
  },
  {
    id: 'config',
    label: 'Config',
    labelKey: 'category.config',
    hue: 332,
    sat: 52,
    defaultOn: false,
    match: [
      '**/package.json',
      '**/tsconfig*.json',
      '**/.env*',
      '**/env.example',
      '**/{Dockerfile,dockerfile}*',
      '**/{docker-compose,Docker-Compose}*.{yml,yaml}',
      '**/.{editorconfig,gitignore,gitattributes,dockerignore,npmrc,nvmrc}',
      '**/*.{yml,yaml,toml,prisma,jsonc}',
      '**/*.config.{ts,tsx,js,jsx,mts,cts,mjs,cjs}',
      '**/*.config.json',
      'data/config/**',
      '.github/**',
    ],
  },
  { id: 'app', label: 'Application code', labelKey: 'category.app', hue: 214, sat: 58 },
];

// ---------------------------------------------------------------------------
// 内置配置档
// ---------------------------------------------------------------------------

/** 未配置的兜底档：不做任何分组，整个仓库一起统计。 */
const PROFILE_ALL: ProfileEntry = { label: 'All', labelKey: 'profile.all' };

/** 常见前后端目录布局：前端目录归前端，其余归后端。 */
const PROFILE_WEB: ProfileEntry = {
  label: 'Frontend / backend',
  labelKey: 'profile.web',
  groups: [
    {
      id: 'frontend',
      label: 'Frontend',
      labelKey: 'profile.frontend',
      hue: 268,
      sat: 46,
      match: [
        'frontend/**',
        'web/**',
        'client/**',
        'ui/**',
        'apps/web/**',
        'packages/ui/**',
        '**/*.{html,css,scss,less,vue,svelte}',
      ],
    },
    { id: 'backend', label: 'Backend', labelKey: 'profile.backend', hue: 214, sat: 58, match: ['**'] },
  ],
};

const BUILTIN_PROFILES: Record<string, ProfileEntry> = { all: PROFILE_ALL, web: PROFILE_WEB };

/** 保留 id：all 是聚合键，其余几个会撞上对象的原型属性。 */
const RESERVED_IDS = new Set(['all', '__proto__', 'prototype', 'constructor']);

const hasOwn = (obj: object, key: string): boolean => Object.hasOwn(obj, key);

// ---------------------------------------------------------------------------
// 配置校验
// ---------------------------------------------------------------------------

interface GroupEntry {
  id: string;
  label: string;
  labelKey?: string;
  hue: number;
  sat: number;
  match: string[];
}

interface ProfileEntry {
  label?: string;
  labelKey?: string;
  groups?: GroupEntry[];
  categories?: CategoryDef[];
  ignore?: string[];
}

function fail(where: string, message: string): never {
  throw new Error(`config ${where}: ${message}`);
}

function asObject(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(where, 'must be an object');
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, where: string): string {
  if (typeof value !== 'string' || value === '') {
    fail(where, 'must be a non-empty string');
  }
  return value;
}

function asStringArray(value: unknown, where: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item === '')) {
    fail(where, 'must be an array of strings');
  }
  return value as string[];
}

function asHue(value: unknown, where: string, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 360) {
    fail(where, 'must be a number between 0 and 360');
  }
  return value;
}

function asPercent(value: unknown, where: string, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    fail(where, 'must be a number between 0 and 100');
  }
  return value;
}

function parseGroups(value: unknown, where: string): GroupEntry[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    fail(where, 'must be an array');
  }
  return value.map((item, i) => {
    const at = `${where}[${i}]`;
    const obj = asObject(item, at);
    return {
      id: asString(obj.id, `${at}.id`),
      label: asString(obj.label, `${at}.label`),
      hue: asHue(obj.hue, `${at}.hue`, 214),
      sat: asPercent(obj.sat, `${at}.sat`, 50),
      match: asStringArray(obj.match, `${at}.match`),
    };
  });
}

function parseCategories(value: unknown, where: string): CategoryDef[] {
  if (value === undefined) {
    return DEFAULT_CATEGORIES;
  }
  if (!Array.isArray(value) || value.length === 0) {
    fail(where, 'must be a non-empty array');
  }
  return value.map((item, i) => {
    const at = `${where}[${i}]`;
    const obj = asObject(item, at);
    const category: CategoryDef = {
      id: asString(obj.id, `${at}.id`),
      label: asString(obj.label, `${at}.label`),
      hue: asHue(obj.hue, `${at}.hue`, 214),
      sat: asPercent(obj.sat, `${at}.sat`, 50),
    };
    if (obj.match !== undefined) {
      category.match = asStringArray(obj.match, `${at}.match`);
    }
    if (obj.defaultOn !== undefined) {
      if (typeof obj.defaultOn !== 'boolean') {
        fail(`${at}.defaultOn`, 'must be a boolean');
      }
      category.defaultOn = obj.defaultOn;
    }
    return category;
  });
}

function parseEntry(value: unknown, where: string): ProfileEntry {
  const obj = asObject(value, where);
  const entry: ProfileEntry = {
    groups: parseGroups(obj.groups, `${where}.groups`),
    categories: parseCategories(obj.categories, `${where}.categories`),
    ignore: obj.ignore === undefined ? [] : asStringArray(obj.ignore, `${where}.ignore`),
  };
  if (obj.label !== undefined) {
    entry.label = asString(obj.label, `${where}.label`);
  }
  return entry;
}

function readJson(path: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    throw new Error(`failed to read config file ${path}: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    // 配置里允许写注释与尾随逗号，README 的示例就是这么给的
    return JSON.parse(stripJsonc(text));
  } catch (err) {
    throw new Error(`failed to parse config file ${path}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * 去掉 jsonc 的注释与尾随逗号：字符串、注释、逗号在同一趟里处理，
 * 字符串里的 `//`、`/*` 与拖尾的 `,` 都原样保留。
 */
function stripJsonc(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      out += ch;
      i += 1;
      while (i < text.length) {
        const inner = text[i];
        out += inner;
        i += 1;
        if (inner === '\\') {
          out += text[i] ?? '';
          i += 1;
        } else if (inner === '"') {
          break;
        }
      }
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') {
        i += 1;
      }
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        i += 1;
      }
      i += 2;
      continue;
    }
    if (ch === ',') {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) {
        j += 1;
      }
      if (text[j] === '}' || text[j] === ']') {
        i += 1;
        continue;
      }
    }
    out += ch;
    i += 1;
  }
  return out;
}

interface ResolvedProfile extends Profile {
  /** 配置文件路径，未使用配置文件时为 undefined。 */
  configPath: string | undefined;
}

interface LoadProfileOptions {
  root: string;
  name: string;
  /** 显式指定的配置文件路径。 */
  configPath?: string;
  /** 在配置之外追加的忽略 glob。 */
  exclude: string[];
}

/**
 * 按名字解析配置档：
 * 1. 名字指向 json 文件时直接当档用；
 * 2. 否则先找配置文件里的 profiles[名字]，再找内置档。
 */
export function loadProfile(opts: LoadProfileOptions): ResolvedProfile {
  const { root, name } = opts;
  const configPath = opts.configPath
    ? resolve(root, opts.configPath)
    : join(root, 'codelens.config.json');

  let entry: ProfileEntry | undefined;
  let usedConfig: string | undefined;

  if (isProfileFile(name)) {
    const file = resolve(root, name);
    entry = parseEntry(readJson(file), file);
    usedConfig = file;
  } else if (opts.configPath || exists(configPath)) {
    const file = asObject(readJson(configPath), configPath);
    const profiles = file.profiles === undefined ? {} : asObject(file.profiles, `profiles of ${configPath}`);
    if (hasOwn(profiles, name)) {
      entry = parseEntry(profiles[name], `profiles.${name} of ${configPath}`);
      usedConfig = configPath;
    } else if (hasOwn(BUILTIN_PROFILES, name)) {
      // 配置里没有这一档就回退内置档：仓库里放了一份自定义配置，
      // 不该让默认的 `codelens` / `--profile web` 直接跑不起来
      entry = BUILTIN_PROFILES[name];
    } else {
      fail(configPath, `has no profile named ${name}; available: ${names(profiles, BUILTIN_PROFILES)}`);
    }
  } else if (hasOwn(BUILTIN_PROFILES, name)) {
    entry = BUILTIN_PROFILES[name];
  } else {
    throw new Error(`no profile named ${name}; available: ${names(undefined, BUILTIN_PROFILES)}`);
  }

  const groups = entry.groups ?? [];
  const ids = new Set<string>();
  for (const group of groups) {
    if (ids.has(group.id)) {
      fail(`groups of ${usedConfig ?? name}`, `contain a duplicate id: ${group.id}`);
    }
    if (RESERVED_IDS.has(group.id)) {
      fail(`groups of ${usedConfig ?? name}`, `must not use the reserved id: ${group.id}`);
    }
    ids.add(group.id);
  }
  for (const category of entry.categories ?? []) {
    if (RESERVED_IDS.has(category.id)) {
      fail(`categories of ${usedConfig ?? name}`, `must not use the reserved id: ${category.id}`);
    }
  }

  return {
    name,
    label: entry.label ?? (groups.length > 0 ? groups.map((group) => group.label).join(' / ') : 'All'),
    groups,
    categories: entry.categories ?? DEFAULT_CATEGORIES,
    ignore: [...(entry.ignore ?? []), ...opts.exclude],
    configPath: usedConfig,
  };
}

function names(profiles: Record<string, unknown> | undefined, builtin: Record<string, ProfileEntry>): string {
  return [...Object.keys(profiles ?? {}), ...Object.keys(builtin)].join(', ');
}

function isProfileFile(name: string): boolean {
  return name.endsWith('.json') || name.includes('/') || name.includes('\\');
}

function exists(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** 供帮助信息使用：列出内置配置档。 */
export function builtinProfileNames(): string[] {
  return Object.keys(BUILTIN_PROFILES);
}
