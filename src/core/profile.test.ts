import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { matchesAny } from './glob.js';
import { DEFAULT_CATEGORIES, loadProfile } from './profile.js';

const dir = mkdtempSync(join(tmpdir(), 'codelens-profile-'));
const configPath = join(dir, 'codelens.config.json');

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const writeConfig = (value: unknown): void => {
  writeFileSync(configPath, JSON.stringify(value));
};

describe('loadProfile', () => {
  test('[loadProfile] 内置 all 档应该不分组并使用默认分类', () => {
    const profile = loadProfile({ root: dir, name: 'all', exclude: [] });
    expect(profile.groups).toEqual([]);
    expect(profile.categories).toEqual(DEFAULT_CATEGORIES);
    expect(profile.configPath).toBeUndefined();
    expect(profile.label).toBe('全部');
  });

  test('[loadProfile] 内置 web 档应该把前端目录与其余部分分开', () => {
    const profile = loadProfile({ root: dir, name: 'web', exclude: [] });
    expect(profile.groups.map((group) => group.id)).toEqual(['frontend', 'backend']);
    const [frontend, backend] = profile.groups;
    expect(matchesAny('frontend/src/a.tsx', frontend.match)).toBe(true);
    expect(matchesAny('web/app.js', frontend.match)).toBe(true);
    expect(matchesAny('src/server.ts', frontend.match)).toBe(false);
    // 兜底分组命中一切，因此前后端之和等于全部
    expect(matchesAny('src/server.ts', backend.match)).toBe(true);
  });

  test('[loadProfile] 未知档名应该提示可选项', () => {
    expect(() => loadProfile({ root: dir, name: 'nope', exclude: [] })).toThrow(/没有名为 nope 的配置档/);
    expect(() => loadProfile({ root: dir, name: 'nope', exclude: [] })).toThrow(/all/);
  });

  test('[loadProfile] 应该读取配置文件里的自定义档', () => {
    writeConfig({
      profiles: {
        modules: {
          label: '按模块',
          groups: [
            { id: 'translation', label: '翻译', hue: 200, sat: 60, match: ['src/modules/translation/**'] },
            { id: 'other', label: '其他', match: ['**'] },
          ],
          categories: [{ id: 'src', label: '源码', hue: 10, sat: 20, match: ['src/**'] }],
          ignore: ['data/**'],
        },
      },
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

  test('[loadProfile] 配置文件里的档缺省字段应该回落到默认分类', () => {
    writeConfig({ profiles: { bare: {} } });
    const profile = loadProfile({ root: dir, name: 'bare', exclude: [] });
    expect(profile.groups).toEqual([]);
    expect(profile.categories).toEqual(DEFAULT_CATEGORIES);
    expect(profile.label).toBe('全部');
  });

  test('[loadProfile] 应该支持把配置文件直接当档用', () => {
    writeFileSync(join(dir, 'my.json'), JSON.stringify({ label: '独立档', groups: [{ id: 'a', label: 'A', match: ['**'] }] }));
    const profile = loadProfile({ root: dir, name: 'my.json', exclude: [] });
    expect(profile.label).toBe('独立档');
    expect(profile.groups).toHaveLength(1);
  });

  test('[loadProfile] 分组 id 重复或占用保留名应该报错', () => {
    writeConfig({ profiles: { dup: { groups: [{ id: 'a', label: 'A', match: ['**'] }, { id: 'a', label: 'B', match: ['**'] }] } } });
    expect(() => loadProfile({ root: dir, name: 'dup', exclude: [] })).toThrow(/重复的 id/);
    writeConfig({ profiles: { reserved: { groups: [{ id: 'all', label: 'A', match: ['**'] }] } } });
    expect(() => loadProfile({ root: dir, name: 'reserved', exclude: [] })).toThrow(/保留的 id/);
  });

  test('[loadProfile] 非法字段应该给出定位明确的错误', () => {
    writeConfig({ profiles: { bad: { groups: [{ label: 'A', match: ['**'] }] } } });
    expect(() => loadProfile({ root: dir, name: 'bad', exclude: [] })).toThrow(/groups\[0\]\.id 必须是非空字符串/);

    writeConfig({ profiles: { bad: { groups: [{ id: 'a', label: 'A', match: 'x' }] } } });
    expect(() => loadProfile({ root: dir, name: 'bad', exclude: [] })).toThrow(/groups\[0\]\.match 必须是字符串数组/);

    writeConfig({ profiles: { bad: { categories: [] } } });
    expect(() => loadProfile({ root: dir, name: 'bad', exclude: [] })).toThrow(/categories 必须是非空数组/);

    writeConfig({ profiles: { bad: { groups: [{ id: 'a', label: 'A', hue: 999, match: ['**'] }] } } });
    expect(() => loadProfile({ root: dir, name: 'bad', exclude: [] })).toThrow(/hue 必须是 0 到 360 之间的数字/);

    writeConfig({ profiles: { bad: { groups: [], ignore: [1] } } });
    expect(() => loadProfile({ root: dir, name: 'bad', exclude: [] })).toThrow(/ignore 必须是字符串数组/);
  });

  test('[loadProfile] 配置文件不是合法 json 时应该报出读取失败', () => {
    writeFileSync(configPath, '{ oops');
    expect(() => loadProfile({ root: dir, name: 'all', exclude: [] })).toThrow(/读取配置文件/);
  });

  test('[loadProfile] 默认分类里生成代码、文档与配置默认不计入', () => {
    const off = DEFAULT_CATEGORIES.filter((cat) => cat.defaultOn === false).map((cat) => cat.id);
    expect(off).toEqual(['generated', 'doc', 'config']);
    expect(DEFAULT_CATEGORIES[DEFAULT_CATEGORIES.length - 1].match).toBeUndefined();
  });
});
