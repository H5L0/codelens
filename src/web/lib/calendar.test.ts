import { describe, expect, test } from 'vitest';
import {
  buildLayout,
  displayEnd,
  fitCells,
  formatDate,
  parseDate,
  shiftDays,
  stripWindow,
  weekCount,
  weekIndex,
  weekStart,
} from './calendar.js';

const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

describe('displayEnd', () => {
  test('[displayEnd] 还在更新（不超过 28 天）就显示到今天', () => {
    expect(displayEnd('2026-09-11', '2026-09-13')).toBe('2026-09-13');
    // 正好 28 天
    expect(displayEnd('2026-08-16', '2026-09-13')).toBe('2026-09-13');
  });

  test('[displayEnd] 荒了超过 28 天就停在最后一次提交', () => {
    // 29 天
    expect(displayEnd('2026-08-15', '2026-09-13')).toBe('2026-08-15');
    expect(displayEnd('2026-01-06', '2026-09-13')).toBe('2026-01-06');
  });

  test('[displayEnd] 提交日期跑到今天之后时不裁掉它', () => {
    expect(displayEnd('2026-09-20', '2026-09-13')).toBe('2026-09-20');
  });

  test('[displayEnd] 没有提交时给今天', () => {
    expect(displayEnd('', '2026-09-13')).toBe('2026-09-13');
  });
});

describe('日期换算', () => {
  test('[parseDate] 与 [formatDate] 互为逆运算', () => {
    expect(formatDate(parseDate('2026-09-06'))).toBe('2026-09-06');
    // 用本地时间构造，避免时区把日期挪走
    expect(parseDate('2026-09-06').getDate()).toBe(6);
  });

  test('[shiftDays] 往后往前挪几天', () => {
    expect(shiftDays('2026-01-05', 6)).toBe('2026-01-11');
    expect(shiftDays('2026-01-05', -7)).toBe('2025-12-29');
    expect(shiftDays('2026-01-05', 0)).toBe('2026-01-05');
  });
});

describe('周换算', () => {
  test('[weekCount] 首尾不足一周也算一周', () => {
    expect(weekCount('2026-01-05', '2026-01-05')).toBe(1);
    // 周三到周四，落在同一周里
    expect(weekCount('2026-01-07', '2026-01-08')).toBe(1);
    expect(weekCount('2026-01-05', '2026-01-11')).toBe(1);
    expect(weekCount('2026-01-05', '2026-01-12')).toBe(2);
    expect(weekCount('', '')).toBe(0);
  });

  test('[weekIndex] 起始周算第 0 周', () => {
    expect(weekIndex('2026-01-07', '2026-01-05')).toBe(0);
    expect(weekIndex('2026-01-07', '2026-01-11')).toBe(0);
    expect(weekIndex('2026-01-07', '2026-01-12')).toBe(1);
    // 早于起始周的是负数
    expect(weekIndex('2026-01-07', '2026-01-04')).toBe(-1);
  });

  test('[weekStart] 起始周往后数第 n 周的周一', () => {
    expect(weekStart('2026-01-07', 0)).toBe('2026-01-05');
    expect(weekStart('2026-01-07', 2)).toBe('2026-01-19');
  });

  test('[fitCells] 按宽度算排得下几格', () => {
    // 36 宽、4 间距：一屏 900 排得下 22 格
    expect(fitCells(900, 36, 4)).toBe(22);
    expect(fitCells(76, 36, 4)).toBe(2);
    expect(fitCells(75, 36, 4)).toBe(1);
    // 再窄也要留一格，免得宽度量出 0 时整块网格消失
    expect(fitCells(40, 36, 4)).toBe(1);
    expect(fitCells(0, 36, 4)).toBe(1);
  });
});

describe('stripWindow', () => {
  // 一屏 22 周、条上排得下 124 格
  const VISIBLE = 22;
  const CELLS = 124;

  test('[stripWindow] 包裹框固定在条中间', () => {
    // 框占了 22 格，前后各留 51 格：窗口从第 100 周起，条就从第 49 格开始画
    expect(stripWindow(CELLS, VISIBLE, 100)).toEqual({ from: 49, count: 124, center: 51 });
  });

  test('[stripWindow] 拖到两头时条伸到数据之外，那几格留空', () => {
    expect(stripWindow(CELLS, VISIBLE, 0)).toEqual({ from: -51, count: 124, center: 51 });
    expect(stripWindow(CELLS, VISIBLE, 178)).toEqual({ from: 127, count: 124, center: 51 });
  });

  test('[stripWindow] 周数比条短时条照样铺满，框还是在中间', () => {
    // 只有 9 周：条仍是 124 格，两端留空，框居中
    expect(stripWindow(CELLS, 9, 0)).toEqual({ from: -57, count: 124, center: 57 });
    expect(stripWindow(CELLS, 5, 0)).toEqual({ from: -59, count: 124, center: 59 });
    expect(stripWindow(0, 1, 0)).toEqual({ from: 0, count: 0, center: 0 });
  });
});

describe('buildLayout', () => {
  test('[buildLayout] 空区间返回空排布', () => {
    expect(buildLayout('', '', MONTHS).weeks).toEqual([]);
    expect(buildLayout('', '', MONTHS).months).toEqual([]);
  });

  test('[buildLayout] 按整周补齐，周一到周日七行', () => {
    // 2026-01-07 是周三
    const layout = buildLayout('2026-01-07', '2026-01-08', MONTHS);
    expect(layout.weeks).toHaveLength(1);
    expect(layout.weeks[0][0]).toBe('2026-01-05');
    expect(layout.weeks[0][6]).toBe('2026-01-11');
    // 补出来的整周也要有格子：窗口外的日子照常画出来，格子本身不做区分
    expect(layout.weeks[0][1]).toBe('2026-01-06');
    expect(layout.weeks[0][3]).toBe('2026-01-08');
    expect(layout.weeks[0][4]).toBe('2026-01-09');
  });

  test('[buildLayout] 窗口从 1 月 1 日开始，首列从上年年底补齐', () => {
    const layout = buildLayout('2026-01-01', '2026-01-20', MONTHS);
    // 2026-01-01 是周四，所在周从 2025-12-29 起
    expect(layout.weeks[0][0]).toBe('2025-12-29');
    expect(layout.months.map((month) => month.name)).toEqual(['1月']);
    expect(layout.months.map((month) => month.col)).toEqual([0]);
  });

  test('[buildLayout] 区间从一个月的中间开始时首月也要有标签', () => {
    const layout = buildLayout('2026-06-24', '2026-07-02', MONTHS);
    expect(layout.months.map((month) => month.name)).toEqual(['6月', '7月']);
    expect(layout.months.map((month) => month.col)).toEqual([0, 1]);
  });

  test('[buildLayout] 窗口第一天与当月 1 号撞在同一列时只留 1 号的标签', () => {
    // 2023-10-30 是周一，这一周里还有 11 月 1 日：两个标签都该落在第一列
    const layout = buildLayout('2023-10-30', '2023-12-31', MONTHS);
    expect(layout.months.map((month) => month.name)).toEqual(['11月', '12月']);
    expect(layout.months.map((month) => month.col)).toEqual([0, 4]);
  });

  test('[buildLayout] 每个月的标签只出现一次', () => {
    const layout = buildLayout('2026-01-05', '2026-04-30', MONTHS);
    const names = layout.months.map((month) => month.name);
    expect(names).toEqual([...new Set(names)]);
    expect(names).toEqual(['1月', '2月', '3月', '4月']);
  });
});
