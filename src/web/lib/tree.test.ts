import { describe, expect, test } from 'vitest';
import type { LocFileEntry } from '../../core/types.js';
import { buildTree, visibleChildren } from './tree.js';

const file = (path: string, lines: number, cat = 'app'): LocFileEntry => ({
  path,
  lines,
  nonBlank: lines,
  cat,
});

describe('buildTree', () => {
  const tree = buildTree(
    [file('src/a.ts', 10), file('src/deep/b.ts', 4), file('src/c.test.ts', 5, 'test'), file('frontend/d.ts', 1)],
    'lines',
    'demo',
    'app',
  );

  test('[buildTree] 根节点应该汇总全部行数与文件数', () => {
    expect(tree.root.name).toBe('demo');
    expect(tree.root.path).toBe('');
    expect(tree.root.value).toBe(20);
    expect(tree.root.fileCount).toBe(4);
  });

  test('[buildTree] 中间目录应该逐级汇总', () => {
    const src = tree.index.get('src');
    expect(src?.value).toBe(19);
    expect(src?.fileCount).toBe(3);
    expect(src?.children.map((child) => child.path)).toEqual(['src/a.ts', 'src/c.test.ts', 'src/deep']);
  });

  test('[buildTree] 子节点应该按行数降序排列', () => {
    expect(tree.root.children.map((child) => child.name)).toEqual(['src', 'frontend']);
    expect(tree.index.get('src')?.children.map((child) => child.value)).toEqual([10, 5, 4]);
  });

  test('[buildTree] 目录应该取占比最大的分类作为配色', () => {
    expect(tree.index.get('src')?.cat).toBe('app');
    expect(tree.index.get('src/deep')?.cat).toBe('app');
  });

  test('[buildTree] 分类占比应该可以取到次要分类', () => {
    const mixed = buildTree([file('a/x.ts', 1), file('a/y.test.ts', 9, 'test')], 'lines', 'demo', 'app');
    expect(mixed.index.get('a')?.cat).toBe('test');
    expect(mixed.index.get('a')?.catSum).toEqual({ app: 1, test: 9 });
  });

  test('[buildTree] 空目录不应该出现，兜底分类用于没有子节点的目录', () => {
    const empty = buildTree([], 'lines', 'demo', 'other');
    expect(empty.root.cat).toBe('other');
    expect(empty.root.children).toEqual([]);
  });

  test('[buildTree] 按非空行统计时应该取 nonBlank', () => {
    const tree2 = buildTree([{ path: 'a.ts', lines: 10, nonBlank: 6, cat: 'app' }], 'nonBlank', 'demo', 'app');
    expect(tree2.root.value).toBe(6);
  });
});

describe('visibleChildren', () => {
  test('[visibleChildren] 应该过滤掉行数为 0 的子节点', () => {
    const tree = buildTree([file('src/a.ts', 5), file('src/b.ts', 0), file('src/c.ts', 3)], 'lines', 'demo', 'app');
    expect(visibleChildren(tree.index.get('src')!).map((child) => child.name)).toEqual(['a.ts', 'c.ts']);
    expect(visibleChildren(tree.index.get('src/a.ts')!)).toEqual([]);
  });
});
