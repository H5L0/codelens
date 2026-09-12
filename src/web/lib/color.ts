// ---------------------------------------------------------------------------
// 颜色与对比度
// 树形图方块按分类色相 + 层级亮度上色，方块上的小字必须和背景有足够对比度。
// 这里按 WCAG 2.1 算相对亮度：先从黑白色里挑更清楚的一种，必要时把背景亮度
// 挪开一点，保证 10.5px 的字也能达到 4.5:1。
// ---------------------------------------------------------------------------

/** 正文小字要求的最低对比度。 */
export const MIN_CONTRAST = 4.5;

const DARK_INK = '#0d1b26';
const LIGHT_INK = '#ffffff';

/** 亮度搜索范围：再暗或再亮都不好看，也不必再挪。 */
const LIGHT_MIN = 16;
const LIGHT_MAX = 88;
const STEP = 3;

interface Inked {
  /** 方块背景色。 */
  bg: string;
  /** 方块上的文字色。 */
  fg: string;
}

type Rgb = readonly [number, number, number];

/** HSL（角度、百分比、百分比）转 0..1 的 RGB。 */
export function hslToRgb(hue: number, sat: number, light: number): Rgb {
  const h = ((((hue % 360) + 360) % 360) / 360);
  const s = Math.min(100, Math.max(0, sat)) / 100;
  const l = Math.min(100, Math.max(0, light)) / 100;
  if (s === 0) {
    return [l, l, l];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number): number => {
    let x = t;
    if (x < 0) {
      x += 1;
    }
    if (x > 1) {
      x -= 1;
    }
    if (x < 1 / 6) {
      return p + (q - p) * 6 * x;
    }
    if (x < 1 / 2) {
      return q;
    }
    if (x < 2 / 3) {
      return p + (q - p) * (2 / 3 - x) * 6;
    }
    return p;
  };
  return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)];
}

/** WCAG 相对亮度。 */
export function luminance(rgb: Rgb): number {
  const channel = (value: number): number => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

export function contrastRatio(a: number, b: number): number {
  const high = Math.max(a, b);
  const low = Math.min(a, b);
  return (high + 0.05) / (low + 0.05);
}

/** `#rrggbb` 的相对亮度。 */
export function hexLuminance(hex: string): number {
  return luminance([
    Number.parseInt(hex.slice(1, 3), 16) / 255,
    Number.parseInt(hex.slice(3, 5), 16) / 255,
    Number.parseInt(hex.slice(5, 7), 16) / 255,
  ]);
}

/** 两个 `#rrggbb` 之间的对比度，供测试与调色使用。 */
export function hexContrast(a: string, b: string): number {
  return contrastRatio(hexLuminance(a), hexLuminance(b));
}

/** 在给定背景亮度上挑一个更清楚的文字色。 */
export function inkOn(background: number): string {
  return contrastRatio(background, 1) >= contrastRatio(background, hexLuminance(DARK_INK)) ? LIGHT_INK : DARK_INK;
}

/**
 * 由分类色相、饱和度与层级亮度得到「背景 + 文字」配色。
 * 首选层级亮度本身，达不到对比度就向两侧逐步试探。
 */
export function inkFor(hue: number, sat: number, light: number): Inked {
  const start = Math.min(LIGHT_MAX, Math.max(LIGHT_MIN, light));
  for (let delta = 0; delta <= LIGHT_MAX - LIGHT_MIN; delta += STEP) {
    const candidates = delta === 0 ? [start] : [start - delta, start + delta];
    for (const candidate of candidates) {
      if (candidate < LIGHT_MIN || candidate > LIGHT_MAX) {
        continue;
      }
      const background = luminance(hslToRgb(hue, sat, candidate));
      const fg = inkOn(background);
      if (contrastRatio(background, fg === LIGHT_INK ? 1 : hexLuminance(DARK_INK)) >= MIN_CONTRAST) {
        return { bg: `hsl(${hue} ${sat}% ${candidate}%)`, fg };
      }
    }
  }
  // 兜底：色相与饱和度固定时，最深和最浅的那一档总有一档能达标
  const background = luminance(hslToRgb(hue, sat, start));
  return { bg: `hsl(${hue} ${sat}% ${start}%)`, fg: inkOn(background) };
}
