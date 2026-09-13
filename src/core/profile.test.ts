import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { matchesAny } from './glob.js';
import { DEFAULT_CATEGORIES, loadProfile } from './profile.js';

const dirs: string[] = [];

/** 每个用例一个干净目录：配置在用例之间互相影响过。 */
const freshDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'codelens-profile-'));
  dirs.push(dir);
  return dir;
};

afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const writeConfig = (dir: string, value: unknown): string => {
  const path = join(dir, 'codelens.config.json');
  writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value));
  return path;
};

describe('loadProfile', () => {
  test('[loadProfile] 内置 all 预设应该不分组并使用默认分类', () => {
    const dir = freshDir();
    const profile = loadProfile({ root: dir, name: 'all', exclude: [] });
    expect(profile.groups).toEqual([]);
    expect(profile.categories).toEqual(DEFAULT_CATEGORIES);
    expect(profile.configPath).toBeUndefined();
    expect(profile.label).toBe('All');
  });

  test('[loadProfile] 内置 web 预设应该把前端目录与其余部分分开', () => {
    const dir = freshDir();
    const profile = loadProfile({ root: dir, name: 'web', exclude: [] });
    expect(profile.groups.map((group) => group.id)).toEqual(['frontend', 'backend']);
    const [frontend, backend] = profile.groups;
    expect(matchesAny('frontend/src/a.tsx', frontend.match)).toBe(true);
    expect(matchesAny('web/app.js', frontend.match)).toBe(true);
    expect(matchesAny('src/server.ts', frontend.match)).toBe(false);
    // 兜底分组命中一切，因此前后端之和等于全部
    expect(matchesAny('src/server.ts', backend.match)).toBe(true);
  });

  test('[loadProfile] 未知预设名应该提示可选项', () => {
    const dir = freshDir();
    expect(() => loadProfile({ root: dir, name: 'nope', exclude: [] })).toThrow(/no profile named nope/);
    expect(() => loadProfile({ root: dir, name: 'nope', exclude: [] })).toThrow(/all/);
  });

  test('[loadProfile] 应该读取配置里的自定义预设', () => {
    const dir = freshDir();
    const configPath = writeConfig(dir, {
      profiles: [
        {
          id: 'modules',
          label: '按模块',
          groups: [
            { id: 'translation', label: '翻译', hue: 200, sat: 60, match: ['src/modules/translation/**'] },
            { id: 'other', label: '其他', match: ['**'] },
          ],
          categories: [{ id: 'src', label: '源码', hue: 10, sat: 20, match: ['src/**'] }],
          ignore: ['data/**'],
        },
      ],
    });
    const profile = loadProfile({ root: dir, name: 'modules', exclude: ['tmp/**'] });
    expect(profile.name).toBe('modules');
    expect(profile.label).toBe('按模块');
    expect(profile.groups[0]).toEqual({
      id: 'translation',
      label: '翻译',
      hue: 200,
      sat: 60,
      match: ['src/modules/translation/**'],
    });
    // hue/sat 缺省时补齐默认值
    expect(profile.groups[1].hue).toBe(214);
    expect(profile.categories).toHaveLength(1);
    expect(profile.ignore).toEqual(['data/**', 'tmp/**']);
    expect(profile.configPath).toBe(configPath);
  });

  test('[loadProfile] 配置里没有内置预设名时应该回退内置预设', () => {
    const dir = freshDir();
    writeConfig(dir, { profiles: [{ id: 'modules', label: '按模块', groups: [{ id: 'a', label: 'A', match: ['**'] }] }] });
    // 仓库里放了一份自定义配置，默认的 all 与 --profile web 仍然要能用
    const all = loadProfile({ root: dir, name: 'all', exclude: [] });
    expect(all.groups).toEqual([]);
    expect(all.label).toBe('All');
    expect(all.configPath).toBeUndefined();
    const web = loadProfile({ root: dir, name: 'web', exclude: [] });
    expect(web.groups.map((group) => group.id)).toEqual(['frontend', 'backend']);
    // 配置里确实有的预设还是走配置
    expect(loadProfile({ root: dir, name: 'modules', exclude: [] }).label).toBe('按模块');
  });

  test('[loadProfile] 配置支持注释与尾随逗号', () => {
    const dir = freshDir();
    writeConfig(
      dir,
      `{
  // 行注释
  "profiles": [
    {
      "id": "commented",
      /* 块注释，注释里出现 // 也应该被忽略 */
      "label": "带注释",
      "groups": [
        { "id": "a", "label": "A", "match": ["**"], },
      ],
    },
  ],
}`,
    );
    const profile = loadProfile({ root: dir, name: 'commented', exclude: [] });
    expect(profile.label).toBe('带注释');
    expect(profile.groups).toHaveLength(1);
  });

  test('[loadProfile] 注释里的花括号与引号不应该影响解析', () => {
    const dir = freshDir();
    writeConfig(dir, '{ /* } " */ "profiles": [ { "id": "odd", "groups": [] } ] }');
    expect(loadProfile({ root: dir, name: 'odd', exclude: [] }).groups).toEqual([]);
  });

  test('[loadProfile] 配置里的预设缺省字段应该回落到默认分类', () => {
    const dir = freshDir();
    writeConfig(dir, { profiles: [{ id: 'bare' }] });
    const profile = loadProfile({ root: dir, name: 'bare', exclude: [] });
    expect(profile.groups).toEqual([]);
    expect(profile.categories).toEqual(DEFAULT_CATEGORIES);
    expect(profile.label).toBe('All');
  });

  test('[loadProfile] 应该支持把配置直接当预设用', () => {
    const dir = freshDir();
    writeFileSync(join(dir, 'my.json'), JSON.stringify({ label: '独立预设', groups: [{ id: 'a', label: 'A', match: ['**'] }] }));
    const profile = loadProfile({ root: dir, name: 'my.json', exclude: [] });
    expect(profile.label).toBe('独立预设');
    expect(profile.groups).toHaveLength(1);
  });

  test('[loadProfile] profiles 必须是数组，每项都要有 id', () => {
    const dir = freshDir();
    writeConfig(dir, { profiles: { modules: {} } });
    expect(() => loadProfile({ root: dir, name: 'modules', exclude: [] })).toThrow(/profiles of .*: must be an array/);

    writeConfig(dir, { profiles: [{ label: 'A' }] });
    expect(() => loadProfile({ root: dir, name: 'modules', exclude: [] })).toThrow(
      /\[0\]\.id: must be a non-empty string/,
    );
  });

  test('[loadProfile] id 重复应该报错', () => {
    const dir = freshDir();
    writeConfig(dir, { profiles: [{ id: 'a' }, { id: 'a' }] });
    expect(() => loadProfile({ root: dir, name: 'a', exclude: [] })).toThrow(/duplicate id: a/);
  });

  test('[loadProfile] 分组 id 重复或占用保留名应该报错', () => {
    const dir = freshDir();
    writeConfig(dir, { profiles: [{ id: 'dup', groups: [{ id: 'a', label: 'A', match: ['**'] }, { id: 'a', label: 'B', match: ['**'] }] }] });
    expect(() => loadProfile({ root: dir, name: 'dup', exclude: [] })).toThrow(/duplicate id/);
    for (const id of ['all', '__proto__', 'constructor']) {
      writeConfig(dir, { profiles: [{ id: 'reserved', groups: [{ id, label: 'A', match: ['**'] }] }] });
      expect(() => loadProfile({ root: dir, name: 'reserved', exclude: [] })).toThrow(/reserved id/);
    }
  });

  test('[loadProfile] 分类 id 重复或占用保留名应该报错', () => {
    const dir = freshDir();
    writeConfig(dir, { profiles: [{ id: 'bad', categories: [{ id: '__proto__', label: 'A' }] }] });
    expect(() => loadProfile({ root: dir, name: 'bad', exclude: [] })).toThrow(/reserved id/);

    writeConfig(dir, { profiles: [{ id: 'dup', categories: [{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }] }] });
    expect(() => loadProfile({ root: dir, name: 'dup', exclude: [] })).toThrow(/categories of .*: contain a duplicate id: a/);
  });

  test('[loadProfile] 分组与分类可以同 id，两边各有各的配色', () => {
    const dir = freshDir();
    writeConfig(dir, {
      profiles: [
        {
          id: 'both',
          groups: [{ id: 'core', label: '核心', match: ['src/**'] }],
          categories: [{ id: 'core', label: '核心代码' }],
        },
      ],
    });
    const profile = loadProfile({ root: dir, name: 'both', exclude: [] });
    expect(profile.groups.map((group) => group.id)).toEqual(['core']);
    expect(profile.categories.map((category) => category.id)).toEqual(['core']);
  });

  test('[loadProfile] 非法字段应该给出定位明确的错误', () => {
    const dir = freshDir();
    writeConfig(dir, { profiles: [{ id: 'bad', groups: [{ label: 'A', match: ['**'] }] }] });
    expect(() => loadProfile({ root: dir, name: 'bad', exclude: [] })).toThrow(/groups\[0\]\.id: must be a non-empty string/);

    writeConfig(dir, { profiles: [{ id: 'bad', groups: [{ id: 'a', label: 'A', match: 'x' }] }] });
    expect(() => loadProfile({ root: dir, name: 'bad', exclude: [] })).toThrow(/groups\[0\]\.match: must be an array of strings/);

    writeConfig(dir, { profiles: [{ id: 'bad', categories: [] }] });
    expect(() => loadProfile({ root: dir, name: 'bad', exclude: [] })).toThrow(/categories: must be a non-empty array/);

    writeConfig(dir, { profiles: [{ id: 'bad', groups: [{ id: 'a', label: 'A', hue: 999, match: ['**'] }] }] });
    expect(() => loadProfile({ root: dir, name: 'bad', exclude: [] })).toThrow(/hue: must be a number between 0 and 360/);

    writeConfig(dir, { profiles: [{ id: 'bad', groups: [], ignore: [1] }] });
    expect(() => loadProfile({ root: dir, name: 'bad', exclude: [] })).toThrow(/ignore: must be an array of strings/);
  });

  test('[loadProfile] 配置读不动或不是合法 json 时应该报出原因', () => {
    const dir = freshDir();
    writeFileSync(join(dir, 'codelens.config.json'), '{ oops');
    expect(() => loadProfile({ root: dir, name: 'all', exclude: [] })).toThrow(/failed to parse config file/);
    rmSync(join(dir, 'codelens.config.json'));
    writeFileSync(join(dir, 'broken.json'), '{ oops');
    expect(() => loadProfile({ root: dir, name: 'broken.json', exclude: [] })).toThrow(/failed to parse config file/);
  });

  test('[loadProfile] 默认分类里生成代码、文档与配置默认不计入', () => {
    const off = DEFAULT_CATEGORIES.filter((cat) => cat.defaultOn === false).map((cat) => cat.id);
    expect(off).toEqual(['generated', 'doc', 'config']);
    expect(DEFAULT_CATEGORIES[DEFAULT_CATEGORIES.length - 1].match).toBeUndefined();
  });

  test('[loadProfile] 内置分类与内置分组都应该带 labelKey，供页面翻译', () => {
    const dir = freshDir();
    expect(DEFAULT_CATEGORIES.every((cat) => cat.labelKey === `category.${cat.id}`)).toBe(true);
    for (const name of ['all', 'web']) {
      const profile = loadProfile({ root: dir, name, exclude: [] });
      expect(profile.groups.every((group) => group.labelKey !== undefined)).toBe(true);
    }
  });
});
