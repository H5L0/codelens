// ---------------------------------------------------------------------------
// 方形化树形图布局
// 把带 value 的条目按面积比例填入矩形，尽量让每块接近正方形。
// 输入 items 需按 value 降序，返回结果与 items 一一对应（顺序一致）。
// ---------------------------------------------------------------------------
import type { Rect, TreeNode } from '../../core/types.js';
import { visibleChildren } from './tree.js';

function worstRatio(areas: readonly number[], side: number): number {
  let total = 0;
  let max = -Infinity;
  let min = Infinity;
  for (const area of areas) {
    total += area;
    if (area > max) max = area;
    if (area < min) min = area;
  }
  if (total <= 0 || min <= 0 || side <= 0) {
    return Infinity;
  }
  const t2 = total * total;
  const s2 = side * side;
  return Math.max((s2 * max) / t2, t2 / (s2 * min));
}

export interface Placed {
  node: TreeNode;
  rect: Rect;
}

export function squarify(items: ReadonlyArray<{ node: TreeNode; value: number }>, rect: Rect): Placed[] {
  const out: Placed[] = [];
  let { x, y, w, h } = rect;
  let i = 0;
  let rest = items.reduce((sum, item) => sum + item.value, 0);
  if (rest <= 0 || w <= 0 || h <= 0) {
    return out;
  }
  let scale = (w * h) / rest;
  while (i < items.length && w > 0.5 && h > 0.5) {
    const side = Math.min(w, h);
    const row: Array<{ node: TreeNode; value: number }> = [];
    let areas: number[] = [];
    let best = Infinity;
    while (i < items.length) {
      const area = items[i].value * scale;
      const test = areas.concat(area);
      const ratio = worstRatio(test, side);
      if (areas.length > 0 && ratio > best) {
        break;
      }
      best = ratio;
      areas = test;
      row.push(items[i]);
      i += 1;
    }
    const rowArea = areas.reduce((sum, area) => sum + area, 0);
    if (w >= h) {
      const stripW = rowArea / h;
      let cy = y;
      for (let k = 0; k < row.length; k += 1) {
        const ih = areas[k] / stripW;
        out.push({ node: row[k].node, rect: { x, y: cy, w: stripW, h: ih } });
        cy += ih;
      }
      x += stripW;
      w -= stripW;
    } else {
      const stripH = rowArea / w;
      let cx = x;
      for (let k = 0; k < row.length; k += 1) {
        const iw = areas[k] / stripH;
        out.push({ node: row[k].node, rect: { x: cx, y, w: iw, h: stripH } });
        cx += iw;
      }
      y += stripH;
      h -= stripH;
    }
    rest -= row.reduce((sum, item) => sum + item.value, 0);
    if (rest > 0) {
      scale = (Math.max(w, 0) * Math.max(h, 0)) / rest;
    }
  }
  return out;
}

/** 顶部标题条的固定高度。 */
export const HEAD_H = 15;
/** 小于这个尺寸的方块不画，避免满屏碎块。 */
const MIN_PX = 3;
/** 单次布局最多画的方块数。 */
const NODE_CAP = 6000;

export interface PaintedNode {
  node: TreeNode;
  /** 相对父容器的坐标。 */
  rect: Rect;
  depth: number;
  /** 实际绘制的标题条高度，0 表示太窄没有标题。 */
  headH: number;
  /** 是否展开子节点。 */
  open: boolean;
  children: PaintedNode[];
}

export interface LayoutOptions {
  w: number;
  h: number;
  /** 已经展开的目录路径。 */
  expanded: ReadonlySet<string>;
  cap?: number;
}

/** 按当前尺寸与展开状态算出要画的方块，供页面直接渲染。 */
export function layoutTreemap(root: TreeNode, opts: LayoutOptions): PaintedNode[] {
  const cap = opts.cap ?? NODE_CAP;
  let drawn = 0;

  const walk = (parent: TreeNode, rect: Rect, depth: number): PaintedNode[] => {
    const items = visibleChildren(parent).map((child) => ({ node: child, value: child.value }));
    if (items.length === 0 || rect.w < 2 || rect.h < 2) {
      return [];
    }
    const out: PaintedNode[] = [];
    for (const placed of squarify(items, rect)) {
      if (drawn >= cap) {
        break;
      }
      drawn += 1;
      const { node } = placed;
      const box = placed.rect;
      if (box.w < MIN_PX || box.h < MIN_PX) {
        continue;
      }
      const open = node.isDir && visibleChildren(node).length > 0 && opts.expanded.has(node.path);
      const headH = box.w >= 30 && box.h >= 16 ? HEAD_H : 0;
      out.push({
        node,
        rect: box,
        depth,
        headH,
        open,
        children: open ? walk(node, { x: 1, y: 1, w: box.w - 2, h: box.h - headH - 2 }, depth + 1) : [],
      });
    }
    return out;
  };

  return walk(root, { x: 0, y: 0, w: opts.w, h: opts.h }, 1);
}
