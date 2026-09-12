// @vitest-environment happy-dom
// 页面级集成测试：用假数据渲染整个 App，检查界面结构与交互是否与旧版一致。
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { CalendarData, GroupStat, LocData } from '../core/types.js';
import { App } from './App.js';

const stat = (commits: number, add: number, del: number): GroupStat => ({ commits, add, del });
const groups = {
  all: stat(1, 30, 5),
  frontend: stat(1, 10, 2),
  backend: stat(1, 20, 3),
};

const calendar: CalendarData = {
  generatedAt: '2026-01-01T00:00:00.000Z',
  root: 'demo',
  profile: 'web',
  groups: [
    { id: 'frontend', label: '前端', hue: 268, sat: 46 },
    { id: 'backend', label: '后端', hue: 214, sat: 58 },
  ],
  range: { min: '2026-01-05', max: '2026-01-06' },
  totals: {
    days: 2,
    groups: {
      all: stat(2, 60, 10),
      frontend: stat(2, 20, 4),
      backend: stat(2, 40, 6),
    },
  },
  maxVal: 30,
  days: {
    '2026-01-05': {
      commits: [{ hash: 'abc1234', subject: '第一个提交', groups }],
      groups,
    },
  },
};
const loc: LocData = {
  generatedAt: '2026-01-01T00:00:00.000Z',
  root: 'demo',
  profile: 'web',
  categories: [
    { id: 'app', label: '应用代码', hue: 214, sat: 58 },
    { id: 'test', label: '测试', hue: 152, sat: 46 },
    { id: 'doc', label: '文档', hue: 268, sat: 46, defaultOn: false },
  ],
  totals: { files: 3, lines: 30, nonBlank: 28 },
  skipped: { binary: 0, large: 0 },
  files: [
    { path: 'src/a.ts', lines: 10, nonBlank: 9, cat: 'app' },
    { path: 'src/b.test.ts', lines: 15, nonBlank: 14, cat: 'test' },
    { path: 'docs/c.md', lines: 5, nonBlank: 5, cat: 'doc' },
  ],
};

let container: HTMLDivElement;
let root: Root;

async function mount(): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(App));
  });
}

const text = (selector: string): string => container.querySelector(selector)?.textContent ?? '';
const all = (selector: string): Element[] => [...container.querySelectorAll(selector)];
const click = async (selector: string): Promise<void> => {
  const target = container.querySelector(selector);
  if (!target) {
    throw new Error(`找不到元素 ${selector}`);
  }
  await act(async () => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

beforeEach(() => {
  // 树形图按容器尺寸布局，测试环境里给出固定尺寸
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 900 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('fetch', async (url: string) => ({
    ok: true,
    status: 200,
    json: async () => (url.includes('loc') ? loc : calendar),
  }));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('App', () => {
  test('[App] 顶部应该给出两个视图与分组开关', async () => {
    await mount();
    const segs = all('.seg');
    expect(segs).toHaveLength(2);
    expect(all('.seg')[0].querySelectorAll('button')).toHaveLength(2);
    expect([...all('.seg')[0].querySelectorAll('button')].map((b) => b.textContent)).toEqual(['改动日历', '代码行数']);
    expect([...all('.seg')[1].querySelectorAll('button')].map((b) => b.textContent)).toEqual(['全部', '前端', '后端']);
    expect(text('h1 span:first-child')).toBe('代码改动日历');
    expect(text('h1 .range')).toBe('2026-01-05 ~ 2026-01-06 · 2 天有提交');
    expect(container.querySelector('h1 .range')?.hasAttribute('hidden')).toBe(false);
  });

  test('[App] 日历应该按周排列并渲染每天的格子', async () => {
    await mount();
    expect(all('.grid .row')).toHaveLength(7);
    // 日历按整周补齐，范围外的日期也画成空格子而不是占位格
    expect(all('.grid .cell')).toHaveLength(7);
    expect(all('.grid .cell.pad')).toHaveLength(0);
    expect(all('.grid .cell.today')).toHaveLength(1);
    expect(all('.grid .cell .hbar.add')).toHaveLength(7);
    expect(all('.month-label').map((el) => el.textContent)).toEqual(['1月']);
    expect(text('.month-row')).toBe('1月');
    expect(all('.grid .cell')[0].querySelector('.hbar.add')?.getAttribute('style')).toContain('36px');
    expect(all('.grid .cell')[0].querySelector('.hbar.del')?.getAttribute('style')).toContain('15px');
    expect(text('.legend-row')).toContain('条宽 = 行数量级，平方根刻度，峰值 30 行/天');
  });

  test('[App] 统计卡应该按分组成对出现并显示日均', async () => {
    await mount();
    expect(all('.stat')).toHaveLength(4);
    expect(all('.stat .k').map((el) => el.textContent)).toEqual(['前端提交', '前端改动行', '后端提交', '后端改动行']);
    expect(all('.stat .v')[0].textContent).toBe('2');
    expect(all('.stat .s')[0].textContent).toBe('日均 1.0 次');
    expect(all('.stat .s')[1].textContent).toBe('日均 12 行');
    expect(text('.stats-ctx')).toBe('区间汇总');
    expect(text('.commits-head')).toBe('2026-01-06 · 无提交');
  });

  test('[App] 鼠标移到某天应该切换成当日统计与提交列表', async () => {
    await mount();
    const cell = container.querySelector('.grid .cell:not(.pad)');
    expect(cell).not.toBeNull();
    await act(async () => {
      cell?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    expect(text('.stats-ctx')).toBe('2026-01-05 当日');
    expect(all('.stats')[0].classList.contains('live')).toBe(true);
    expect(text('.commits-head')).toBe('2026-01-05 · 1 个提交');
    expect(text('.commit .hash')).toBe('abc1234');
    expect(text('.commit .subj')).toBe('第一个提交');
    expect(text('.commit .nums')).toBe('+30 -5');
    await act(async () => {
      cell?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    });
    expect(text('.stats-ctx')).toBe('区间汇总');
  });

  test('[App] 切换到代码行数视图应该隐藏日历并展示树形图', async () => {
    await mount();
    const sections = [...container.querySelectorAll('main > section')];
    expect(sections[0].hasAttribute('hidden')).toBe(false);
    expect(sections[1].hasAttribute('hidden')).toBe(true);
    expect(container.querySelector('h1 .range')?.hasAttribute('hidden')).toBe(false);

    await click('.seg button:nth-of-type(2)');
    expect(text('h1 span:first-child')).toBe('代码行数');
    expect(container.querySelector('h1 .range')?.hasAttribute('hidden')).toBe(true);
    expect(container.querySelectorAll('main > section')[0].hasAttribute('hidden')).toBe(true);
    expect(container.querySelectorAll('main > section')[1].hasAttribute('hidden')).toBe(false);
    expect(container.querySelectorAll('.seg')[1].hasAttribute('hidden')).toBe(true);
  });

  test('[App] 行数视图应该给出汇总、面包屑与分类图例', async () => {
    await mount();
    await click('.seg button:nth-of-type(2)');
    expect(text('.loc-summary')).toBe('当前筛选 25/30 行 · 2/3 个文件 · 覆盖全仓库 83.3%');
    expect(text('.tm-crumbs')).toBe('demo25 行 · 占筛选总量 100.0%');
    expect(all('.tm-legend .lg')).toHaveLength(3);
    expect(all('.tm-legend .lg-name').map((el) => el.textContent)).toEqual(['应用代码', '测试', '文档']);
    expect(all('.tm-legend .lg')[2].classList.contains('off')).toBe(true);
    expect(text('.tm-legend .lg-val')).toBe('10 行 / 1 文件');
    expect(text('.tm-status .path')).toBe('点击方块放大到该目录并铺满画面，面包屑可返回');
    expect(all('.sw-item')).toHaveLength(2);
    expect(text('.depth-value')).toBe('2 层');
  });

  test('[App] 树形图应该画出方块并支持点击放大与 Esc 返回', async () => {
    await mount();
    await click('.seg button:nth-of-type(2)');
    // 子节点按行数降序，b.test.ts（15 行）排在 a.ts（10 行）前面
    expect(all('.tm-node').map((el) => el.getAttribute('data-path'))).toEqual(['src', 'src/b.test.ts', 'src/a.ts']);
    expect(all('.tm-node')[0].querySelector('.tm-head .tm-name')?.textContent).toBe('src');
    expect(all('.tm-node')[0].querySelector('.tm-head .tm-val')?.textContent).toBe('25');
    expect(all('.tm-node')[1].querySelector('.tm-head .tm-val')?.textContent).toBe('15');

    await act(async () => {
      container.querySelector('.tm-node[data-path="src"]')?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    expect(text('.tm-status .path')).toBe('src');
    expect(text('.tm-status .meta')).toBe('25 行 · 占 100.0% · 2 个文件');

    await click('.tm-node[data-path="src"]');
    expect(text('.tm-crumbs')).toBe('demo/src25 行 · 占筛选总量 100.0%');
    expect(all('.tm-crumbs button.crumb')).toHaveLength(1);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(text('.tm-crumbs')).toBe('demo25 行 · 占筛选总量 100.0%');
    expect(all('.tm-crumbs button.crumb')).toHaveLength(0);
  });

  test('[App] 图例开关与显示层级开关应该改变树形图', async () => {
    await mount();
    await click('.seg button:nth-of-type(2)');
    await click('.tm-legend .lg:nth-of-type(2)');
    expect(text('.loc-summary')).toBe('当前筛选 10/30 行 · 1/3 个文件 · 覆盖全仓库 33.3%');
    expect(all('.tm-node').map((el) => el.getAttribute('data-path'))).toEqual(['src', 'src/a.ts']);
    await click('.tm-legend .lg:nth-of-type(2)');
    expect(all('.tm-node')).toHaveLength(3);

    await click('.sw-item:nth-of-type(2) input');
    expect(text('.depth-value')).toBe('1 层');
    expect(all('.tm-node').map((el) => el.getAttribute('data-path'))).toEqual(['src']);
  });

  test('[App] 剔除空行开关应该切换统计口径', async () => {
    await mount();
    await click('.seg button:nth-of-type(2)');
    await click('.sw-item:nth-of-type(1) input');
    expect(text('.loc-summary')).toBe('当前筛选 23/28 行 · 2/3 个文件 · 覆盖全仓库 82.1%');
    expect(text('.tm-legend .lg-val')).toBe('9 行 / 1 文件');
  });

  test('[App] 数据读取失败时应该给出可读的提示', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 404, json: async () => ({}) }));
    await mount();
    expect(text('.load-error')).toContain('无法读取改动数据（HTTP 404）');
    expect(text('.load-error')).toContain('codelens');
  });
});
