import { describe, expect, test } from 'vitest';
import type { LocFileEntry, Rect, TreeNode } from '../../core/types.js';
import { buildTree } from './tree.js';
import { HEAD_H, layoutTreemap, squarify } from './treemap.js';
import type { PaintedNode } from './treemap.js';

const item = (value: number): { node: TreeNode; value: number } => ({
  node: { name: `n${value}`, path: `n${value}`, isDir: false, children: [], value, fileCount: 1, cat: 'app', catSum: {} },
  value,
});

const area = (rect: Rect): number => rect.w * rect.h;

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9;
}

interface PlacedNode {
  node: PaintedNode;
  abs: Rect;
}

/** 把嵌套坐标换算成相对容器的绝对坐标，子节点的原点在父节点标题条下方。 */
function collect(nodes: readonly PaintedNode[], origin: { x: number; y: number } = { x: 0, y: 0 }): PlacedNode[] {
  const out: PlacedNode[] = [];
  for (const node of nodes) {
    const abs: Rect = {
      x: origin.x + node.rect.x,
      y: origin.y + node.rect.y,
      w: node.rect.w,
      h: node.rect.h,
    };
    out.push({ node, abs });
    if (node.children.length > 0) {
      out.push(...collect(node.children, { x: abs.x, y: abs.y + node.headH }));
    }
  }
  return out;
}

describe('squarify', () => {
  const box: Rect = { x: 0, y: 0, w: 400, h: 300 };
  const items = [item(120), item(80), item(60), item(30), item(10)];
  const placed = squarify(items, box);

  test('[squarify] 应该返回与输入等长的结果并保持顺序', () => {
    expect(placed).toHaveLength(items.length);
    expect(placed.map((entry) => entry.node)).toEqual(items.map((entry) => entry.node));
  });

  test('[squarify] 面积之和应该等于容器面积', () => {
    const sum = placed.reduce((total, entry) => total + area(entry.rect), 0);
    expect(sum).toBeCloseTo(box.w * box.h, 6);
  });

  test('[squarify] 每块面积应该与取值成正比', () => {
    const unit = area(placed[0].rect) / items[0].value;
    for (let i = 1; i < items.length; i += 1) {
      expect(area(placed[i].rect) / items[i].value).toBeCloseTo(unit, 6);
    }
  });

  test('[squarify] 各块之间不应该重叠且不越界', () => {
    for (const entry of placed) {
      expect(entry.rect.x).toBeGreaterThanOrEqual(box.x - 1e-9);
      expect(entry.rect.y).toBeGreaterThanOrEqual(box.y - 1e-9);
      expect(entry.rect.x + entry.rect.w).toBeLessThanOrEqual(box.x + box.w + 1e-9);
      expect(entry.rect.y + entry.rect.h).toBeLessThanOrEqual(box.y + box.h + 1e-9);
    }
    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        expect(overlaps(placed[i].rect, placed[j].rect)).toBe(false);
      }
    }
  });

  test('[squarify] 空输入或零面积容器应该返回空结果', () => {
    expect(squarify([], box)).toEqual([]);
    expect(squarify(items, { x: 0, y: 0, w: 0, h: 0 })).toEqual([]);
    expect(squarify([item(0)], box)).toEqual([]);
  });

  // 布局的取舍全在「方块接近正方形」上：换成按比例切条也能满足上面几条不变量，
  // 但长条会细到看不清、过不了绘制时的最小尺寸过滤，所以形状本身要单独守住。
  const ratios = (): number[] => placed.map((entry) => Math.max(entry.rect.w / entry.rect.h, entry.rect.h / entry.rect.w));

  test('[squarify] 平均长宽比应该保持在可读范围', () => {
    const mean = ratios().reduce((total, ratio) => total + ratio, 0) / placed.length;
    expect(mean).toBeLessThan(4);
  });

  test('[squarify] 大块不应该退化成细条', () => {
    expect(Math.max(...ratios())).toBeLessThan(12);
  });
});

describe('layoutTreemap', () => {
  const files: LocFileEntry[] = [
    { path: 'src/a.ts', lines: 60, nonBlank: 60, cat: 'app' },
    { path: 'src/b.ts', lines: 40, nonBlank: 40, cat: 'app' },
    { path: 'src/deep/c.ts', lines: 30, nonBlank: 30, cat: 'app' },
    { path: 'docs/d.md', lines: 20, nonBlank: 20, cat: 'doc' },
  ];
  const tree = buildTree(files, 'lines', 'demo', 'app');
  const size = { w: 800, h: 500 };

  test('[layoutTreemap] 顶层方块应该铺满容器且铺满面积', () => {
    const painted = layoutTreemap(tree.root, { ...size, expanded: new Set(['']) });
    const sum = painted.reduce((total, node) => total + area(node.rect), 0);
    expect(sum).toBeCloseTo(size.w * size.h, 4);
    expect(painted.map((node) => node.node.name)).toEqual(['src', 'docs']);
  });

  test('[layoutTreemap] 未展开的目录不应该有子方块', () => {
    const painted = layoutTreemap(tree.root, { ...size, expanded: new Set(['']) });
    const src = painted.find((node) => node.node.path === 'src');
    expect(src?.open).toBe(false);
    expect(src?.children).toEqual([]);
  });

  test('[layoutTreemap] 展开的目录应该把子方块排在标题条下方', () => {
    const painted = layoutTreemap(tree.root, { ...size, expanded: new Set(['', 'src']) });
    const src = painted.find((node) => node.node.path === 'src');
    expect(src?.open).toBe(true);
    expect(src?.children.map((child) => child.node.name)).toEqual(['a.ts', 'b.ts', 'deep']);
    const srcBox = src!.rect;
    for (const child of src!.children) {
      expect(child.rect.x).toBeGreaterThanOrEqual(1);
      expect(child.rect.y).toBeGreaterThanOrEqual(1);
      expect(child.rect.x + child.rect.w).toBeLessThanOrEqual(srcBox.w - 1);
      expect(child.rect.y + child.rect.h).toBeLessThanOrEqual(srcBox.h - HEAD_H - 1);
    }
  });

  test('[layoutTreemap] 所有方块都应该落在容器内且互不重叠', () => {
    const painted = layoutTreemap(tree.root, { ...size, expanded: new Set(['', 'src', 'src/deep']) });
    const all = collect(painted);
    for (const { abs } of all) {
      expect(abs.x).toBeGreaterThanOrEqual(-1e-9);
      expect(abs.y).toBeGreaterThanOrEqual(-1e-9);
      expect(abs.x + abs.w).toBeLessThanOrEqual(size.w + 1e-9);
      expect(abs.y + abs.h).toBeLessThanOrEqual(size.h + 1e-9);
    }
    const siblings = new Map<string, PlacedNode[]>();
    for (const entry of all) {
      const parent = entry.node.node.path.includes('/') ? entry.node.node.path.slice(0, entry.node.node.path.lastIndexOf('/')) : '';
      const list = siblings.get(parent) ?? [];
      list.push(entry);
      siblings.set(parent, list);
    }
    for (const list of siblings.values()) {
      for (let i = 0; i < list.length; i += 1) {
        for (let j = i + 1; j < list.length; j += 1) {
          expect(overlaps(list[i].abs, list[j].abs)).toBe(false);
        }
      }
    }
  });

  test('[layoutTreemap] 标题条高度按方块尺寸决定', () => {
    const painted = layoutTreemap(tree.root, { ...size, expanded: new Set(['']) });
    for (const node of painted) {
      const expected = node.rect.w >= 30 && node.rect.h >= 16 ? HEAD_H : 0;
      expect(node.headH).toBe(expected);
    }
  });

  test('[layoutTreemap] 过小的方块不绘制', () => {
    const tiny = buildTree(
      [files[0], { path: 'tiny/x.ts', lines: 1, nonBlank: 1, cat: 'app' }],
      'lines',
      'demo',
      'app',
    );
    const painted = layoutTreemap(tiny.root, { w: 40, h: 30, expanded: new Set(['']) });
    for (const node of painted) {
      expect(node.rect.w).toBeGreaterThanOrEqual(3);
      expect(node.rect.h).toBeGreaterThanOrEqual(3);
    }
  });

  test('[layoutTreemap] 超过上限时应该停止绘制', () => {
    const painted = layoutTreemap(tree.root, { ...size, expanded: new Set(['', 'src', 'src/deep']), cap: 2 });
    expect(collect(painted)).toHaveLength(2);
  });

  test('[layoutTreemap] 容器尺寸为 0 时应该不绘制', () => {
    expect(layoutTreemap(tree.root, { w: 0, h: 0, expanded: new Set(['']) })).toEqual([]);
    expect(layoutTreemap(tree.root, { w: 1, h: 1, expanded: new Set(['']) })).toEqual([]);
  });
});
