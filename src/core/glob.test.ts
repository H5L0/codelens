import { describe, expect, test } from 'vitest';
import { globToRegExp, matchesAny } from './glob.js';

describe('globToRegExp', () => {
  test('[globToRegExp] 含分隔符的模式应该从开头锚定', () => {
    expect(globToRegExp('src/**').test('src/a/b.ts')).toBe(true);
    expect(globToRegExp('src/**').test('x/src/a.ts')).toBe(false);
    expect(globToRegExp('src').test('src/a.ts')).toBe(false);
  });

  test('[globToRegExp] 不含分隔符的模式应该匹配任意层级的同名文件', () => {
    const re = globToRegExp('package.json');
    expect(re.test('package.json')).toBe(true);
    expect(re.test('a/b/package.json')).toBe(true);
    expect(re.test('package.json.bak')).toBe(false);
  });

  test('[globToRegExp] 双星号跨目录而单星号不跨目录', () => {
    expect(matchesAny('a/b/c.test.ts', ['**/*.test.ts'])).toBe(true);
    expect(matchesAny('c.test.ts', ['**/*.test.ts'])).toBe(true);
    expect(matchesAny('a/b/c.test.ts', ['a/*.test.ts'])).toBe(false);
    expect(matchesAny('a/c.test.ts', ['a/*.test.ts'])).toBe(true);
    expect(matchesAny('a/b.ts', ['a/**'])).toBe(true);
  });

  test('[globToRegExp] 花括号应该展开为择一', () => {
    expect(matchesAny('a/x.test.tsx', ['**/*.{test,spec}.{ts,tsx}'])).toBe(true);
    expect(matchesAny('a/x.spec.ts', ['**/*.{test,spec}.{ts,tsx}'])).toBe(true);
    expect(matchesAny('a/x.ts', ['**/*.{test,spec}.{ts,tsx}'])).toBe(false);
    expect(matchesAny('x/Dockerfile', ['**/{Dockerfile,dockerfile}*'])).toBe(true);
    expect(matchesAny('a/dockerfile.prod', ['**/{Dockerfile,dockerfile}*'])).toBe(true);
  });

  test('[globToRegExp] 问号只匹配单个非分隔字符', () => {
    expect(matchesAny('a1.ts', ['a?.ts'])).toBe(true);
    expect(matchesAny('a12.ts', ['a?.ts'])).toBe(false);
    expect(matchesAny('a/b.ts', ['a?b.ts'])).toBe(false);
  });

  test('[globToRegExp] 正则元字符应该被当作普通字符', () => {
    expect(matchesAny('a+b/c.ts', ['a+b/*.ts'])).toBe(true);
    expect(matchesAny('aab/c.ts', ['a+b/*.ts'])).toBe(false);
    expect(matchesAny('x(1)/c.ts', ['x(1)/*.ts'])).toBe(true);
    expect(matchesAny('pkg.json', ['pkg.json'])).toBe(true);
  });

  test('[globToRegExp] 给出 base 时应该限定在基准目录内', () => {
    expect(globToRegExp('*.ts', 'src').test('src/a.ts')).toBe(true);
    expect(globToRegExp('*.ts', 'src').test('src/deep/a.ts')).toBe(true);
    expect(globToRegExp('*.ts', 'src').test('a.ts')).toBe(false);
    expect(globToRegExp('deep/*.ts', 'src').test('src/deep/a.ts')).toBe(true);
    expect(globToRegExp('deep/*.ts', 'src').test('other/deep/a.ts')).toBe(false);
  });

  test('[matchesAny] 空模式列表应该不命中任何路径', () => {
    expect(matchesAny('a.ts', [])).toBe(false);
    expect(matchesAny('a.ts', ['*.ts', '*.md'])).toBe(true);
  });
});
