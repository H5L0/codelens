import { describe, expect, test } from 'vitest';
import { isIgnored, parseIgnoreText } from './gitignore.js';

const rules = (text: string): ReturnType<typeof parseIgnoreText> => parseIgnoreText(text, '');

describe('parseIgnoreText', () => {
  test('[parseIgnoreText] 注释与空行应该被忽略', () => {
    expect(rules('# 注释\n\n   \nfoo\n')).toHaveLength(1);
  });

  test('[parseIgnoreText] 结尾空格应该被去掉，转义的空格应该保留', () => {
    expect(isIgnored('foo', false, rules('foo   \n'))).toBe(true);
    expect(isIgnored('foo ', false, rules('foo\\ \n'))).toBe(true);
  });

  test('[parseIgnoreText] 不含分隔符的模式应该匹配任意层级', () => {
    const r = rules('node_modules\n');
    expect(isIgnored('node_modules', true, r)).toBe(true);
    expect(isIgnored('a/b/node_modules', true, r)).toBe(true);
    expect(isIgnored('a/node_modules.ts', false, r)).toBe(false);
  });

  test('[parseIgnoreText] 开头的分隔符应该只锚定仓库根', () => {
    const r = rules('/build\n');
    expect(isIgnored('build', true, r)).toBe(true);
    expect(isIgnored('a/build', true, r)).toBe(false);
  });

  test('[parseIgnoreText] 含分隔符的模式应该相对所在目录锚定', () => {
    const r = rules('src/gen/\n');
    expect(isIgnored('src/gen', true, r)).toBe(true);
    expect(isIgnored('src/gen/a.ts', false, r)).toBe(false);
  });

  test('[parseIgnoreText] 结尾分隔符应该只匹配目录', () => {
    const r = rules('dist/\n');
    expect(isIgnored('dist', true, r)).toBe(true);
    expect(isIgnored('dist', false, r)).toBe(false);
  });

  test('[parseIgnoreText] 感叹号应该反向排除，后出现的规则优先', () => {
    const r = rules('*.log\n!keep.log\n');
    expect(isIgnored('a.log', false, r)).toBe(true);
    expect(isIgnored('keep.log', false, r)).toBe(false);
    const reversed = rules('!keep.log\n*.log\n');
    expect(isIgnored('keep.log', false, reversed)).toBe(true);
  });

  test('[parseIgnoreText] 双星号应该跨目录匹配', () => {
    const r = rules('docs/**/*.tmp\n');
    expect(isIgnored('docs/a.tmp', false, r)).toBe(true);
    expect(isIgnored('docs/x/y/a.tmp', false, r)).toBe(true);
    expect(isIgnored('other/a.tmp', false, r)).toBe(false);
  });
});

describe('isIgnored', () => {
  test('[isIgnored] 嵌套目录的规则应该限定在自身子树内', () => {
    const root = parseIgnoreText('*.log\n', '');
    const nested = [...root, ...parseIgnoreText('build/\n', 'packages/a')];
    expect(isIgnored('packages/a/build', true, nested)).toBe(true);
    expect(isIgnored('packages/b/build', true, nested)).toBe(false);
    expect(isIgnored('packages/a/x.log', false, nested)).toBe(true);
  });

  test('[isIgnored] 没有命中任何规则时不应该忽略', () => {
    expect(isIgnored('src/a.ts', false, rules('*.log\n'))).toBe(false);
    expect(isIgnored('src/a.ts', false, [])).toBe(false);
  });
});
