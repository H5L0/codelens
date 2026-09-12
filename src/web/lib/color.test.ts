import { describe, expect, test } from 'vitest';
import { MIN_CONTRAST, contrastRatio, hexContrast, hexLuminance, hslToRgb, inkFor, inkOn, luminance } from './color.js';

/** 内置分类的色相与饱和度，树形图用它上色。 */
const COLORS: Array<[string, number, number]> = [
  ['test', 152, 46],
  ['generated', 220, 8],
  ['script', 32, 62],
  ['doc', 268, 46],
  ['config', 332, 52],
  ['app', 214, 58],
];

/** 与视图里的层级亮度一致：越深越暗，最暗 32。 */
const levelLight = (depth: number): number => Math.max(32, 60 - depth * 6);

/** 把 inkFor 返回的 `hsl(h s% l%)` 还原成相对亮度。 */
function luminanceOf(bg: string): number {
  const match = /hsl\((\d+(?:\.\d+)?) (\d+(?:\.\d+)?)% (\d+(?:\.\d+)?)%\)/.exec(bg);
  if (!match) {
    throw new Error(`不是 hsl 颜色：${bg}`);
  }
  return luminance(hslToRgb(Number(match[1]), Number(match[2]), Number(match[3])));
}

function contrastOf(bg: string, fg: string): number {
  const background = luminanceOf(bg);
  return fg === '#ffffff' ? contrastRatio(background, 1) : contrastRatio(background, hexLuminance(fg));
}

describe('inkFor', () => {
  test('[inkFor] 每个分类在各层级下的小字都达到 4.5:1', () => {
    for (const [name, hue, sat] of COLORS) {
      for (let depth = 1; depth <= 5; depth += 1) {
        const { bg, fg } = inkFor(hue, sat, levelLight(depth));
        const ratio = contrastOf(bg, fg);
        expect(ratio, `${name} depth ${depth} ${bg} on ${fg}`).toBeGreaterThanOrEqual(MIN_CONTRAST);
      }
    }
  });

  test('[inkFor] 尽量保留层级亮度，只在必要时挪动', () => {
    // test 分类的第一层本来就够清楚，不该被改掉
    expect(inkFor(152, 46, levelLight(1)).bg).toBe('hsl(152 46% 54%)');
    // 中间色调（浅色文字和深色文字都不够）需要挪动亮度
    const mid = inkFor(220, 8, 48);
    expect(mid.bg).not.toBe('hsl(220 8% 48%)');
    expect(contrastOf(mid.bg, mid.fg)).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });

  test('[inkFor] 文字色只有黑白两种，且随背景切换', () => {
    expect(inkFor(152, 46, 10).fg).toBe('#ffffff');
    expect(inkFor(152, 46, 90).fg).toBe('#0d1b26');
  });

  test('[inkFor] 色相与饱和度照原样保留', () => {
    expect(inkFor(268, 46, 54).bg.startsWith('hsl(268 46% ')).toBe(true);
  });
});

describe('颜色换算', () => {
  test('[hslToRgb] 灰阶与非灰阶都对得上', () => {
    expect(hslToRgb(0, 0, 0)).toEqual([0, 0, 0]);
    expect(hslToRgb(0, 0, 100)).toEqual([1, 1, 1]);
    const [r, g, b] = hslToRgb(0, 100, 50);
    expect(r).toBeCloseTo(1, 5);
    expect(g).toBeCloseTo(0, 5);
    expect(b).toBeCloseTo(0, 5);
  });

  test('[luminance] 黑白两端分别是 0 与 1', () => {
    expect(luminance([0, 0, 0])).toBe(0);
    expect(luminance([1, 1, 1])).toBeCloseTo(1, 5);
  });

  test('[contrastRatio] 黑白对比度是 21:1，同色是 1:1', () => {
    expect(contrastRatio(0, 1)).toBeCloseTo(21, 5);
    expect(contrastRatio(0.5, 0.5)).toBe(1);
  });

  test('[hexContrast] 内置调色板在各类底色上都够清楚', () => {
    // 正文与辅助文字：白底、页面底、卡片底
    for (const token of ['#1a1f27', '#5b6470', '#676f7b', '#2f63c8']) {
      for (const bg of ['#ffffff', '#f7f8fa']) {
        expect(hexContrast(token, bg), `${token} on ${bg}`).toBeGreaterThanOrEqual(MIN_CONTRAST);
      }
    }
    // 增删色按观感偏亮，白底上退到 4:1；日历里它铺在格底上，也还在 3:1 之上
    for (const token of ['#2b8f4f', '#d4513f']) {
      expect(hexContrast(token, '#ffffff'), `${token} on white`).toBeGreaterThanOrEqual(4);
      expect(hexContrast(token, '#edf0f3'), `${token} on cell bg`).toBeGreaterThanOrEqual(3);
    }
    // 开关滑轨是非文字控件，按 3:1 要求
    for (const bg of ['#ffffff', '#f7f8fa']) {
      expect(hexContrast('#848e9a', bg)).toBeGreaterThanOrEqual(3);
    }
  });

  test('[inkOn] 亮底选深色字，暗底选白色字', () => {
    expect(inkOn(1)).toBe('#0d1b26');
    expect(inkOn(0)).toBe('#ffffff');
  });
});
