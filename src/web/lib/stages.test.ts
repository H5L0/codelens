import { describe, expect, test } from 'vitest';
import type { PaintedNode } from './treemap.js';
import { MAX_STAGES, nextStages } from './stages.js';
import type { StageSpec } from './stages.js';

const painted = (path: string): PaintedNode[] => [
  {
    node: { name: path, path, isDir: false, children: [], value: 1, fileCount: 1, cat: 'app', catSum: {} },
    rect: { x: 0, y: 0, w: 10, h: 10 },
    depth: 1,
    headH: 0,
    open: false,
    children: [],
  },
];

const advance = (prev: StageSpec[], paintedPaths: string[], zooming: boolean): StageSpec[] =>
  nextStages(prev, {
    id: prev.length === 0 ? 1 : prev[prev.length - 1].id + 1,
    painted: painted(paintedPaths.join('+')),
    empty: false,
    anim: zooming ? { kind: 'in', rect: { x: 0, y: 0, w: 1, h: 1 } } : undefined,
  });

describe('nextStages', () => {
  test('[nextStages] 空列表上的首次绘制产生一个舞台', () => {
    const stages = advance([], ['a'], false);
    expect(stages).toHaveLength(1);
    expect(stages[0].anim).toBeUndefined();
  });

  test('[nextStages] 连续放大最多保留 MAX_STAGES 个舞台，最新的在最上', () => {
    let stages: StageSpec[] = [];
    for (let i = 0; i < 10; i += 1) {
      stages = advance(stages, [`level${i}`], true);
      expect(stages.length).toBeLessThanOrEqual(MAX_STAGES);
      // 最后一个是最新推入的，也是动画播放的那一个
      const top = stages[stages.length - 1];
      expect(top.painted[0].node.path).toBe(`level${i}`);
      expect(top.anim).toMatchObject({ kind: 'in' });
    }
    // 交叉过渡留下的舞台按推入顺序排列，id 严格递增
    const ids = stages.map((stage) => stage.id);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
  });

  test('[nextStages] 过滤条件变化时就地替换最后一个舞台的内容并保留 id', () => {
    const first = advance([], ['a'], false);
    const replaced = advance(first, ['b'], false);
    expect(replaced).toHaveLength(1);
    expect(replaced[0].id).toBe(first[0].id);
    expect(replaced[0].painted[0].node.path).toBe('b');
  });

  test('[nextStages] 内容没变时返回同一个数组，不触发重建', () => {
    const first = advance([], ['a'], false);
    const same = nextStages(first, { id: first[0].id + 1, painted: first[0].painted, empty: false, anim: undefined });
    expect(same).toBe(first);
  });
});
