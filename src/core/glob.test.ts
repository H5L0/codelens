import { describe, expect, test } from 'vitest';
import { createGlob, expandBraces, firstMatch, matchesAny } from './glob.js';

describe('createGlob', () => {
  test('[createGlob] 含分隔符的模式应该从开头锚定', () => {
    expect(createGlob('src/**')('src/a/b.ts')).toBe(true);
    expect(createGlob('src/**')('x/src/a.ts')).toBe(false);
    expect(createGlob('src')('src/a.ts')).toBe(false);
  });

  test('[createGlob] 不含分隔符的模式应该匹配任意层级的同名文件', () => {
    expect(createGlob('package.json')('package.json')).toBe(true);
    expect(createGlob('package.json')('a/b/package.json')).toBe(true);
    expect(createGlob('package.json')('package.json.bak')).toBe(false);
  });

  test('[createGlob] 双星号跨目录而单星号不跨目录', () => {
    expect(matchesAny('a/b/c.test.ts', ['**/*.test.ts'])).toBe(true);
    expect(matchesAny('c.test.ts', ['**/*.test.ts'])).toBe(true);
    expect(matchesAny('a/b/c.test.ts', ['a/*.test.ts'])).toBe(false);
    expect(matchesAny('a/c.test.ts', ['a/*.test.ts'])).toBe(true);
    expect(matchesAny('a/b.ts', ['a/**'])).toBe(true);
  });

  test('[createGlob] 花括号应该展开为择一', () => {
    expect(matchesAny('a/x.test.tsx', ['**/*.{test,spec}.{ts,tsx}'])).toBe(true);
    expect(matchesAny('a/x.spec.ts', ['**/*.{test,spec}.{ts,tsx}'])).toBe(true);
    expect(matchesAny('a/x.ts', ['**/*.{test,spec}.{ts,tsx}'])).toBe(false);
    expect(matchesAny('x/Dockerfile', ['**/{Dockerfile,dockerfile}*'])).toBe(true);
    expect(matchesAny('a/dockerfile.prod', ['**/{Dockerfile,dockerfile}*'])).toBe(true);
  });

  test('[createGlob] 问号只匹配单个非分隔字符', () => {
    expect(matchesAny('a1.ts', ['a?.ts'])).toBe(true);
    expect(matchesAny('a12.ts', ['a?.ts'])).toBe(false);
    expect(matchesAny('a/b.ts', ['a?b.ts'])).toBe(false);
  });

  test('[createGlob] 正则元字符应该被当作普通字符', () => {
    expect(matchesAny('a+b/c.ts', ['a+b/*.ts'])).toBe(true);
    expect(matchesAny('aab/c.ts', ['a+b/*.ts'])).toBe(false);
    expect(matchesAny('x(1)/c.ts', ['x(1)/*.ts'])).toBe(true);
    expect(matchesAny('pkg.json', ['pkg.json'])).toBe(true);
  });

  test('[createGlob] 给出 base 时应该限定在基准目录内', () => {
    expect(createGlob('*.ts', 'src')('src/a.ts')).toBe(true);
    expect(createGlob('*.ts', 'src')('src/deep/a.ts')).toBe(true);
    expect(createGlob('*.ts', 'src')('a.ts')).toBe(false);
    expect(createGlob('deep/*.ts', 'src')('src/deep/a.ts')).toBe(true);
    expect(createGlob('deep/*.ts', 'src')('other/deep/a.ts')).toBe(false);
  });

  test('[createGlob] 开头的斜杠表示从基准目录起算', () => {
    expect(matchesAny('foo', ['/foo'])).toBe(true);
    expect(matchesAny('a/foo', ['/foo'])).toBe(false);
  });

  test('[createGlob] 结尾的斜杠表示目录及其全部内容', () => {
    expect(matchesAny('data', ['data/'])).toBe(true);
    expect(matchesAny('data/a.json', ['data/'])).toBe(true);
    expect(matchesAny('src/data/a.json', ['data/'])).toBe(true);
    expect(matchesAny('database/a.json', ['data/'])).toBe(false);
  });

  test('[createGlob] 不含分隔符的目录写法应该匹配任意层级的目录', () => {
    expect(matchesAny('a/b/mydata/x.ts', ['mydata/'])).toBe(true);
    expect(matchesAny('mydata', ['mydata/'])).toBe(true);
  });

  test('[matchesAny] 空模式列表应该不命中任何路径', () => {
    expect(matchesAny('a.ts', [])).toBe(false);
    expect(matchesAny('a.ts', ['*.ts', '*.md'])).toBe(true);
  });

  test('[matchesAny] 重复调用的结果应该稳定', () => {
    const pattern = '**/*.{ts,tsx}';
    expect(matchesAny('a/b.ts', [pattern])).toBe(true);
    expect(matchesAny('a/b.ts', [pattern])).toBe(true);
    expect(matchesAny('a/b.md', [pattern])).toBe(false);
  });
});

describe('firstMatch', () => {
  const defs = [
    { id: 'frontend', match: ['frontend/**'] },
    { id: 'backend', match: ['**'] },
  ];

  test('[firstMatch] 应该取第一个命中的定义', () => {
    expect(firstMatch('frontend/a.ts', defs)).toBe('frontend');
    expect(firstMatch('src/a.ts', defs)).toBe('backend');
  });

  test('[firstMatch] 没有命中时返回 undefined 或 fallback', () => {
    expect(firstMatch('src/a.ts', [defs[0]])).toBeUndefined();
    expect(firstMatch('src/a.ts', [], 'app')).toBe('app');
  });

  test('[firstMatch] 无 match 的定义作为兜底，命中不到别的才用它', () => {
    const defs = [{ id: 'app' }, { id: 'test', match: ['**/*.test.ts'] }];
    expect(firstMatch('src/a.test.ts', defs)).toBe('test');
    expect(firstMatch('src/a.ts', defs)).toBe('app');
  });
});

describe('expandBraces', () => {
  test('[expandBraces] 没有花括号时原样返回', () => {
    expect(expandBraces('src/**')).toEqual(['src/**']);
  });

  test('[expandBraces] 嵌套花括号按组合展开', () => {
    expect(expandBraces('a{b,c}d')).toEqual(['abd', 'acd']);
    expect(expandBraces('{a,{b,c}}')).toEqual(['a', 'b', 'c']);
  });
});

describe('恶意模式', () => {
  test('[安全性] 反复出现的双星号不应该拖住匹配', () => {
    // 旧实现把 `**` 直译成 `.*`，这个模式会指数级回溯；现在必须是线性时间
    const pattern = `${'**a'.repeat(10)}**b`;
    const path = `${'a'.repeat(40)}c.ts`;
    const started = Date.now();
    expect(matchesAny(path, [pattern])).toBe(false);
    expect(Date.now() - started).toBeLessThan(500);
  });

  test('[安全性] 花括号组合爆炸时退回字面量而不展开', () => {
    const pattern = `${'{a,b}'.repeat(12)}`;
    const expanded = expandBraces(pattern);
    expect(expanded).toEqual([pattern]);
  });
});
