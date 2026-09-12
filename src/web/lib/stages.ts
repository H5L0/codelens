// ---------------------------------------------------------------------------
// 舞台状态机
// 舞台是树形图的一次绘制结果：放大时旧舞台留在下面淡出，新舞台从被点击的方块展开。
// 这里只放纯粹的列表推进规则，动画与计时留在视图里，规则本身可以单独断言。
// ---------------------------------------------------------------------------
import type { Rect } from '../../core/types.js';
import type { PaintedNode } from './treemap.js';

/** 过渡时长，视图用它排定淡出与清理的计时。 */
export const ANIM_MS = 300;

/** 同时保留的舞台数：快速连点时不要无限堆积。 */
export const MAX_STAGES = 3;

export type Anim = { kind: 'in'; rect: Rect } | { kind: 'out'; focusPath: string };

export interface StageSpec {
  id: number;
  painted: PaintedNode[];
  empty: boolean;
  anim: Anim | undefined;
}

/** 推进舞台列表所需的输入，id 由调用方递增给出。 */
interface StageInput {
  id: number;
  painted: PaintedNode[];
  empty: boolean;
  anim: Anim | undefined;
}

/**
 * 推进舞台列表：
 * - 带动画时追加一个新舞台，旧的最多留 MAX_STAGES − 1 个做交叉过渡；
 * - 不带画时就地替换最后一个舞台的内容；
 * - 内容没变时原样返回同一个数组，避免重建舞台、重放动画。
 */
export function nextStages(prev: StageSpec[], input: StageInput): StageSpec[] {
  const { id, painted, empty, anim } = input;
  if (anim) {
    return [...prev.slice(1 - MAX_STAGES), { id, painted, empty, anim }];
  }
  if (prev.length === 0) {
    return [{ id, painted, empty, anim: undefined }];
  }
  const last = prev[prev.length - 1];
  if (last.painted === painted && last.empty === empty) {
    return prev;
  }
  return [...prev.slice(0, -1), { ...last, painted, empty }];
}
