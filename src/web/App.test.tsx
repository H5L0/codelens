// @vitest-environment happy-dom
// 页面级集成测试：用假数据渲染整个 App，检查界面结构与交互。
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { CalendarData, GroupStat, LocData } from '../core/types.js';
import { App } from './App.js';
import i18n from './lib/i18n.js';

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
  maxCommits: 1,
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
  skipped: { binary: 0, large: 0, unreadable: 0 },
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
const hover = async (selector: string, type = 'mouseover'): Promise<void> => {
  const target = container.querySelector(selector);
  if (!target) {
    throw new Error(`找不到元素 ${selector}`);
  }
  await act(async () => {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true }));
  });
};
const key = async (selector: string, name: string): Promise<void> => {
  const target = container.querySelector(selector);
  if (!target) {
    throw new Error(`找不到元素 ${selector}`);
  }
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
  });
};
/** 拖动条上的一次拖动：按下、移动、松开，位置都用 clientX 说。 */
const drag = async (selector: string, fromX: number, toX: number): Promise<void> => {
  const target = container.querySelector(selector);
  if (!target) {
    throw new Error(`找不到元素 ${selector}`);
  }
  await act(async () => {
    target.dispatchEvent(new MouseEvent('pointerdown', { clientX: fromX, buttons: 1, bubbles: true }));
    target.dispatchEvent(new MouseEvent('pointermove', { clientX: toX, buttons: 1, bubbles: true }));
    target.dispatchEvent(new MouseEvent('pointerup', { clientX: toX, buttons: 0, bubbles: true }));
  });
};
/** 给元素一个假的位置（happy-dom 里 getBoundingClientRect 全是 0），动画起点靠它算出来。 */
const place = (selector: string, rect: [number, number, number, number]): void => {
  const el = container.querySelector(selector);
  if (!el) {
    throw new Error(`找不到元素 ${selector}`);
  }
  el.setAttribute('data-rect', rect.join(','));
};
/** 最新舞台的行内 transform：空串表示没在播展开动画。 */
const stageTransform = (): string =>
  (all('.tm-stage').at(-1) as HTMLElement | undefined)?.style.transform ?? '';

beforeEach(async () => {
  // 语言默认跟随浏览器，测试里固定成中文，断言才有确定结果
  await i18n.changeLanguage('zh');
  // 树形图按容器尺寸布局，测试环境里给出固定尺寸
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 900 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });
  // 舞台与方块的几何：带 data-rect 的元素按它算，其余当作 900x600 的容器
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value(this: HTMLElement): DOMRect {
      const raw = this.dataset.rect;
      const [x, y, w, h] = raw ? raw.split(',').map(Number) : [0, 0, 900, 600];
      return {
        x,
        y,
        width: w,
        height: h,
        top: y,
        left: x,
        right: x + w,
        bottom: y + h,
        toJSON: () => ({ x, y, width: w, height: h }),
      } as DOMRect;
    },
  });
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // 日历窗口跟着“今天”走，固定成 2026-01-20（最后一次提交后 14 天），断言才有确定结果
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-01-20T12:00:00'));
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
  vi.useRealTimers();
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
    expect(text('h1 .range')).toBe('2026年1月5日 ~ 2026年1月6日（2 天有提交）');
    expect(container.querySelector('h1 .range')?.hasAttribute('hidden')).toBe(false);
  });

  test('[App] 日历窗口按容器宽度铺满，第一次提交之前的周也照常铺格子', async () => {
    await mount();
    expect(all('.grid .row')).toHaveLength(7);
    // 容器 900 宽，36px 的格子放得下 22 列；数据只有三周，窗口照样铺满 22 列，最右一列停在数据末尾
    expect(all('.grid .cell')).toHaveLength(22 * 7);
    expect(all('.grid .cell.pad')).toHaveLength(0);
    const dates = all('.grid .cell').map((cell) => cell.getAttribute('data-date') ?? '');
    expect(new Set(dates).size).toBe(22 * 7);
    expect(dates[0]).toBe('2025-08-25');
    expect(dates.at(-1)).toBe('2026-01-25');
    // 第一次提交（1 月 5 日）之前的格子也铺出来，画得更深且不参与悬浮放大
    const outCell = container.querySelector('.grid .cell[data-date="2025-08-25"]');
    expect(outCell?.classList.contains('out')).toBe(true);
    expect(outCell?.querySelector('.hbar.add')?.getAttribute('style')).toContain('0px');
    // 区间外的 152 天都标成 out，区间内的两天照常
    expect(all('.grid .cell.out')).toHaveLength(22 * 7 - 2);
    expect(container.querySelector('.grid .cell[data-date="2026-01-05"]')?.classList.contains('out')).toBe(false);
    // 月份标签跟着整个窗口走，从窗口首月排到数据所在的 1 月
    expect(all('.month-label').map((el) => el.textContent)).toEqual(['8月', '9月', '10月', '11月', '12月', '1月']);
    // 顶部一行：左边是显示的时间范围（收在数据范围内、按本地写法），右边是两条色带的图例
    expect(text('.cal-range')).toBe('2026年1月5日 ~ 2026年1月6日');
    expect(all('.cal-legend .legend-item').map((el) => el.textContent)).toEqual(['新增行', '删除行']);
    // 提交全在一屏里，不出现拖动条
    expect(container.querySelector('.scrub')).toBeNull();
    const day = container.querySelector('.grid .cell[data-date="2026-01-05"]');
    expect(day?.querySelector('.hbar.add')?.getAttribute('style')).toContain('36px');
    expect(day?.querySelector('.hbar.del')?.getAttribute('style')).toContain('15px');
  });

  test('[App] 图例可以点掉一条色带，只留一条时格子改成整格铺色', async () => {
    await mount();
    const day = (): Element | null => container.querySelector('.grid .cell[data-date="2026-01-05"]');
    const item = (metric: string): Element | null => container.querySelector(`.cal-legend .legend-item[data-metric="${metric}"]`);
    const bars = (): number => day()?.querySelectorAll('.hbar').length ?? 0;
    const fill = (selector = '.hfill'): string =>
      (day()?.querySelector(selector) as HTMLElement | null)?.style.opacity ?? 'none';
    // 两条都在：一格两根色带，不铺色
    expect(bars()).toBe(2);
    expect(day()?.querySelector('.hfill')).toBeNull();
    expect(item('add')?.getAttribute('aria-pressed')).toBe('true');
    // 点掉删除行：改成整格绿色填充；1 月 5 日新增 30 行，正好是该指标的峰值，铺满
    await click('.cal-legend .legend-item[data-metric="del"]');
    expect(bars()).toBe(0);
    expect(fill('.hfill.add')).toBe('1');
    expect(item('del')?.getAttribute('aria-pressed')).toBe('false');
    expect(item('del')?.classList.contains('off')).toBe(true);
    // 区间外的格子没有改动，填充全透明，只剩底色
    const out = container.querySelector('.grid .cell[data-date="2025-08-25"]');
    expect((out?.querySelector('.hfill.add') as HTMLElement | null)?.style.opacity).toBe('0');
    // 点回来恢复两根色带，再点掉新增行就只剩红色填充
    await click('.cal-legend .legend-item[data-metric="del"]');
    expect(bars()).toBe(2);
    await click('.cal-legend .legend-item[data-metric="add"]');
    expect(day()?.querySelectorAll('.hfill.del')).toHaveLength(1);
    // 两条都点掉：格子既不画色带也不铺色
    await click('.cal-legend .legend-item[data-metric="del"]');
    expect(day()?.querySelectorAll('.hbar, .hfill')).toHaveLength(0);
    // 再点回两条，恢复原来的画法
    await click('.cal-legend .legend-item[data-metric="add"]');
    await click('.cal-legend .legend-item[data-metric="del"]');
    expect(bars()).toBe(2);
  });

  test('[App] 日历左侧列出周一到周日七天', async () => {
    await mount();
    expect(all('.dow-labels span').map((el) => el.textContent)).toEqual(['一', '二', '三', '四', '五', '六', '日']);
  });

  test('[App] 日历格子应该可以用键盘读到当天信息', async () => {
    await mount();
    const cells = all('.grid .cell');
    expect(cells.every((cell) => cell.tagName === 'BUTTON')).toBe(true);
    expect(container.querySelector('.grid .cell[data-date="2026-01-05"]')?.getAttribute('aria-label')).toBe(
      '2026年1月5日，1 个提交，新增 30 行、删除 5 行',
    );
    expect(container.querySelector('.grid .cell[data-date="2026-01-06"]')?.getAttribute('aria-label')).toBe(
      '2026年1月6日，无提交，新增 0 行、删除 0 行',
    );
    // 整块网格只有一个格子能被 Tab 停住，默认停在最后一次提交那天
    const tabbable = cells.filter((cell) => cell.getAttribute('tabindex') === '0');
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0].getAttribute('data-date')).toBe('2026-01-06');
    expect(container.querySelector('.grid')?.getAttribute('role')).toBe('grid');
  });

  test('[App] 今天离最后一次提交不远时落在窗口里并标记出来', async () => {
    vi.setSystemTime(new Date('2026-01-06T12:00:00'));
    await mount();
    expect(all('.grid .cell.today').map((el) => el.getAttribute('data-date'))).toEqual(['2026-01-06']);
    expect(container.querySelector('.grid .cell.today')?.getAttribute('aria-current')).toBe('date');
  });

  test('[App] 荒了超过 28 天时窗口停在最后一次提交，今天不再画出来', async () => {
    vi.setSystemTime(new Date('2026-02-10T12:00:00'));
    await mount();
    expect(all('.grid .cell.today')).toHaveLength(0);
    // 窗口停在最后一次提交那一周（2026-01-05 ~ 2026-01-11），左边照常往前铺满一屏
    expect(all('.grid .cell')).toHaveLength(22 * 7);
    expect(all('.grid .cell').at(-1)?.getAttribute('data-date')).toBe('2026-01-11');
  });

  test('[App] 统计卡应该按分组成对出现并显示日均', async () => {
    await mount();
    expect(all('.stat')).toHaveLength(4);
    expect(all('.stat .k').map((el) => el.textContent)).toEqual([
      '前端累计提交',
      '前端累计改动行',
      '后端累计提交',
      '后端累计改动行',
    ]);
    expect(all('.stat .v')[0].textContent).toBe('2');
    expect(all('.stat .s')[0].textContent).toBe('日均 1.0 次，峰值 1 次/天');
    expect(all('.stat .s')[1].textContent).toBe('日均 12 行，峰值 30 行/天');
    // 区间汇总的标题已经去掉，口径由卡片的“累计”标题表达
    expect(container.querySelector('.stats-ctx')).toBeNull();
    expect(text('.commits-head')).toBe('2026年1月6日，无提交');
  });

  test('[App] 鼠标移到某天应该切换成当日统计与提交列表', async () => {
    await mount();
    const cell = '.grid .cell[data-date="2026-01-05"]';
    // 没选日期时是区间口径，标题带“累计”；悬浮某天后换成当日口径
    expect(all('.stat .k').map((el) => el.textContent)).toEqual([
      '前端累计提交',
      '前端累计改动行',
      '后端累计提交',
      '后端累计改动行',
    ]);
    await hover(cell);
    expect(all('.stats')[0].classList.contains('live')).toBe(true);
    expect(all('.stat .k').map((el) => el.textContent)).toEqual(['前端提交', '前端改动行', '后端提交', '后端改动行']);
    expect(text('.commits-head')).toBe('2026年1月5日，1 个提交');
    expect(text('.commit .hash')).toBe('abc1234');
    expect(text('.commit .subj')).toBe('第一个提交');
    expect(text('.commit .nums')).toBe('+30 -5');
    await hover(cell, 'mouseout');
    expect(all('.stats')[0].classList.contains('live')).toBe(false);
    expect(all('.stat .k')[0].textContent).toBe('前端累计提交');
  });

  test('[App] 点一下某天应该钉住它，鼠标移开也不复位', async () => {
    await mount();
    const cell = '.grid .cell[data-date="2026-01-05"]';
    await hover(cell);
    await click(cell);
    expect(all('.grid .cell.selected')).toHaveLength(1);
    expect(all('.grid .cell.selected')[0].getAttribute('data-date')).toBe('2026-01-05');
    await hover(cell, 'mouseout');
    expect(all('.stat .k')[0].textContent).toBe('前端提交');
    expect(text('.commit .subj')).toBe('第一个提交');
    // 再点一下取消钉住，退回区间口径
    await click(cell);
    expect(all('.grid .cell.selected')).toHaveLength(0);
    expect(all('.stat .k')[0].textContent).toBe('前端累计提交');
  });

  test('[App] 方向键应该在日期之间移动', async () => {
    await mount();
    const first = container.querySelector('.grid .cell[data-date="2026-01-05"]') as HTMLButtonElement;
    const second = container.querySelector('.grid .cell[data-date="2026-01-06"]') as HTMLButtonElement;
    await act(async () => {
      first.focus();
    });
    expect(text('.commits-head')).toBe('2026年1月5日，1 个提交');
    await act(async () => {
      first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(text('.commits-head')).toBe('2026年1月6日，无提交');
    // 到达最后一次提交后不再移动
    await act(async () => {
      second.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(text('.commits-head')).toBe('2026年1月6日，无提交');
  });

  test('[App] 只看某个分组时提交列表应该用同一口径', async () => {
    await mount();
    await click('.seg:last-of-type button:nth-of-type(2)');
    await hover('.grid .cell[data-date="2026-01-05"]');
    expect(all('.stat .v')[0].textContent).toBe('1');
    expect(text('.commit .nums')).toBe('+10 -2');
    expect(text('.commits-head')).toBe('2026年1月5日，前端 1 个提交');
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
    expect(text('.loc-summary')).toBe('当前筛选 25/30 行，2/3 个文件，覆盖全仓库 83.3%');
    expect(text('.tm-crumbs')).toBe('demo25 行，占筛选总量 100.0%');
    expect(all('.tm-legend .lg')).toHaveLength(3);
    // 图例按未筛选前的行数排：测试 15 行 > 应用代码 10 行 > 文档 5 行
    expect(all('.tm-legend .lg-name').map((el) => el.textContent)).toEqual(['测试', '应用代码', '文档']);
    expect(all('.tm-legend .lg')[2].classList.contains('off')).toBe(true);
    expect(all('.tm-legend .lg')[2].getAttribute('aria-pressed')).toBe('false');
    expect(text('.tm-legend .lg-val')).toBe('15 行 / 1 文件');
    // 面包屑下面不该再有第二行状态栏
    expect(container.querySelector('.tm-status')).toBeNull();
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
    // 可放大的目录是可以聚焦的按钮，文件只作为图形读出数值
    expect(all('.tm-node')[0].getAttribute('role')).toBe('button');
    expect(all('.tm-node')[0].getAttribute('tabindex')).toBe('0');
    expect(all('.tm-node')[1].getAttribute('role')).toBe('img');

    // 文件方块的悬浮只进左边的数值，不进面包屑
    await hover('.tm-node[data-path="src/b.test.ts"]');
    expect(all('.tm-crumbs .crumb.preview')).toHaveLength(0);
    // 可放大的目录会作为灰色预告挂在面包屑尾部
    await hover('.tm-node[data-path="src"]');
    expect(text('.tm-crumbs .crumb.preview')).toBe('src');

    await click('.tm-node[data-path="src"]');
    expect(text('.tm-crumbs')).toBe('demo/src25 行，占筛选总量 100.0%');
    expect(all('.tm-crumbs button.crumb')).toHaveLength(1);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(text('.tm-crumbs')).toBe('demo25 行，占筛选总量 100.0%');
    expect(all('.tm-crumbs button.crumb')).toHaveLength(0);
  });

  test('[App] 树形图方块应该可以用回车放大', async () => {
    await mount();
    await click('.seg button:nth-of-type(2)');
    const node = container.querySelector('.tm-node[data-path="src"]');
    expect(node).not.toBeNull();
    await act(async () => {
      node?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(text('.tm-crumbs')).toBe('demo/src25 行，占筛选总量 100.0%');
  });

  test('[App] 图例开关与显示层级开关应该改变树形图', async () => {
    await mount();
    await click('.seg button:nth-of-type(2)');
    await click('.tm-legend .lg[data-cat="test"]');
    expect(text('.loc-summary')).toBe('当前筛选 10/30 行，1/3 个文件，覆盖全仓库 33.3%');
    expect(all('.tm-node').map((el) => el.getAttribute('data-path'))).toEqual(['src', 'src/a.ts']);
    await click('.tm-legend .lg[data-cat="test"]');
    expect(all('.tm-node')).toHaveLength(3);

    await click('.sw-item:nth-of-type(2) input');
    expect(text('.depth-value')).toBe('1 层');
    expect(all('.tm-node').map((el) => el.getAttribute('data-path'))).toEqual(['src']);
  });

  test('[App] 图例顺序按未筛选前的总行数固定，不随开关或口径变化', async () => {
    await mount();
    await click('.seg button:nth-of-type(2)');
    const names = (): (string | null)[] => all('.tm-legend .lg-name').map((el) => el.textContent);
    expect(names()).toEqual(['测试', '应用代码', '文档']);
    // 关掉排在最前面的分类，其余位置不动（文档默认就是关的）
    await click('.tm-legend .lg[data-cat="test"]');
    expect(names()).toEqual(['测试', '应用代码', '文档']);
    expect(all('.tm-legend .lg[data-cat]').map((el) => el.getAttribute('aria-pressed'))).toEqual([
      'false',
      'true',
      'false',
    ]);
    await click('.tm-legend .lg[data-cat="test"]');
    // 换成剔除空行的口径也不重排
    await click('.sw-item:nth-of-type(1) input');
    expect(names()).toEqual(['测试', '应用代码', '文档']);
  });

  test('[App] 放大动画应该从被点击的方块展开', async () => {
    await mount();
    await click('.seg button:nth-of-type(2)');
    place('.tm-node[data-path="src"]', [100, 50, 200, 120]);
    await click('.tm-node[data-path="src"]');
    const fresh = all('.tm-stage').at(-1) as HTMLElement;
    // 起点就是被点方块的左上角与它相对容器的缩放比例：200/900 宽、120/600 高
    expect(fresh.classList.contains('entering')).toBe(true);
    expect(fresh.style.transformOrigin).toBe('0 0');
    expect(fresh.style.transform).toBe(`translate(100px, 50px) scale(${200 / 900}, ${120 / 600})`);
  });

  test('[App] 切换视图与重排都不该重放放大动画', async () => {
    await mount();
    await click('.seg button:nth-of-type(2)');
    place('.tm-node[data-path="src"]', [100, 50, 200, 120]);
    await click('.tm-node[data-path="src"]');
    const start = stageTransform();
    expect(start).toContain('translate(100px, 50px)');
    // 切到日历再切回来：不能又摆回起点再展开一次
    await click('.seg button:nth-of-type(1)');
    await click('.seg button:nth-of-type(2)');
    expect(stageTransform()).not.toContain('translate(100px, 50px)');
    // 换显示层级会让舞台重排，动画不能再跑一遍，行内样式也要清干净
    await click('.sw-item:nth-of-type(2) input');
    expect(stageTransform()).toBe('');
    expect(all('.tm-stage').every((el) => !el.classList.contains('entering'))).toBe(true);
  });

  test('[App] 剔除空行开关应该切换统计规则', async () => {
    await mount();
    await click('.seg button:nth-of-type(2)');
    await click('.sw-item:nth-of-type(1) input');
    expect(text('.loc-summary')).toBe('当前筛选 23/28 行，2/3 个文件，覆盖全仓库 82.1%');
    expect(text('.tm-legend .lg-val')).toBe('14 行 / 1 文件');
  });

  test('[App] 数据比一屏长时可以用拖动条平移窗口', async () => {
    // 2025-06-16 到 2026-01-06：32 周，一屏只放得下 22 周
    const long: CalendarData = {
      ...calendar,
      range: { min: '2025-06-16', max: '2026-01-06' },
      days: { ...calendar.days, '2025-06-16': calendar.days['2026-01-05'] },
    };
    vi.stubGlobal('fetch', async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => (url.includes('loc') ? loc : long),
    }));
    await mount();
    // 默认贴着最新的一周：窗口是 2025-08-25 ~ 2026-01-25，头部只显示到还有数据的地方
    expect(all('.grid .cell')).toHaveLength(22 * 7);
    expect(all('.grid .cell')[0].getAttribute('data-date')).toBe('2025-08-25');
    expect(text('.cal-range')).toBe('2025年8月25日 ~ 2026年1月6日');
    // 拖动条铺满整行（一屏排得下 128 格），历史只有 32 周：32 格居中、两端留空
    const frame = container.querySelector('.scrub-frame') as HTMLElement;
    const track = container.querySelector('.scrub-track') as HTMLElement;
    expect(all('.scrub-track .sc')).toHaveLength(128);
    expect(all('.scrub-track .sc:not(.void)')).toHaveLength(32);
    // 包裹框固定在条的中间：两侧各 53 格
    expect(frame.style.left).toBe(`${53 * 7 - 2}px`);
    expect(frame.style.width).toBe(`${22 * 7}px`);
    expect(track.getAttribute('aria-valuenow')).toBe('11');
    expect(track.getAttribute('aria-valuemax')).toBe('11');
    // 方向键一次挪一周，框不动、动的是格子
    await key('.scrub-track', 'ArrowLeft');
    expect(text('.cal-range')).toBe('2025年8月18日 ~ 2026年1月6日');
    expect(all('.grid .cell')[0].getAttribute('data-date')).toBe('2025-08-18');
    expect(frame.style.left).toBe(`${53 * 7 - 2}px`);
    // Home / End 到两头
    await key('.scrub-track', 'Home');
    expect(all('.grid .cell')[0].getAttribute('data-date')).toBe('2025-06-16');
    expect(text('.cal-range')).toBe('2025年6月16日 ~ 2025年11月16日');
    // 到最旧的一周：32 周仍在条上，只是整体往右挪了
    expect(all('.scrub-track .sc:not(.void)')).toHaveLength(32);
    await key('.scrub-track', 'End');
    expect(all('.grid .cell')[0].getAttribute('data-date')).toBe('2025-08-25');
    // 拖格子条：往右拖看到更早的周，框始终不动
    await drag('.scrub-track', 172, 200);
    expect(text('.cal-range')).toBe('2025年7月28日 ~ 2025年12月28日');
    expect(all('.grid .cell')[0].getAttribute('data-date')).toBe('2025-07-28');
    expect(frame.style.left).toBe(`${53 * 7 - 2}px`);
  });

  test('[App] 松手丢了或松在条外，窗口都不该继续跟着指针动', async () => {
    const long: CalendarData = {
      ...calendar,
      range: { min: '2025-06-16', max: '2026-01-06' },
      days: { ...calendar.days, '2025-06-16': calendar.days['2026-01-05'] },
    };
    vi.stubGlobal('fetch', async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => (url.includes('loc') ? loc : long),
    }));
    await mount();
    const track = (): Element => {
      const el = container.querySelector('.scrub-track');
      if (!el) {
        throw new Error('找不到拖动条');
      }
      return el;
    };
    const dragging = (): boolean => container.querySelector('.scrub')?.classList.contains('dragging') ?? false;
    // pointerup 整个丢失：松开之后的移动只收尾，不再平移窗口
    await act(async () => {
      track().dispatchEvent(new MouseEvent('pointerdown', { clientX: 172, buttons: 1, bubbles: true }));
      track().dispatchEvent(new MouseEvent('pointermove', { clientX: 200, buttons: 1, bubbles: true }));
    });
    expect(text('.cal-range')).toBe('2025年7月28日 ~ 2025年12月28日');
    expect(dragging()).toBe(true);
    await act(async () => {
      track().dispatchEvent(new MouseEvent('pointermove', { clientX: 260, buttons: 0, bubbles: true }));
    });
    expect(text('.cal-range')).toBe('2025年7月28日 ~ 2025年12月28日');
    expect(dragging()).toBe(false);
    // 松手落在条外：条收不到 pointerup，兜底监听也要收尾
    await act(async () => {
      track().dispatchEvent(new MouseEvent('pointerdown', { clientX: 172, buttons: 1, bubbles: true }));
      track().dispatchEvent(new MouseEvent('pointermove', { clientX: 200, buttons: 1, bubbles: true }));
    });
    await act(async () => {
      container.dispatchEvent(new MouseEvent('pointerup', { clientX: 200, buttons: 0, bubbles: true }));
    });
    expect(dragging()).toBe(false);
    const settled = text('.cal-range');
    expect(settled).toBe('2025年6月30日 ~ 2025年11月30日');
    // 指针只是扫过条：窗口必须停住（修好之前这里会继续平移）
    await act(async () => {
      track().dispatchEvent(new MouseEvent('pointermove', { clientX: 320, buttons: 0, bubbles: true }));
    });
    expect(text('.cal-range')).toBe(settled);
    // 右键按下不该开始拖动
    await act(async () => {
      track().dispatchEvent(new MouseEvent('pointerdown', { clientX: 200, button: 2, buttons: 2, bubbles: true }));
    });
    expect(dragging()).toBe(false);
  });

  test('[App] 数据读取失败时应该给出可读的提示与重试', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      calls += 1;
      return { ok: false, status: 404, json: async () => ({}) };
    });
    await mount();
    expect(text('.load-error')).toContain('无法读取改动数据（HTTP 404）');
    expect(text('.load-error')).toContain('codelens');
    const before = calls;
    await click('.load-error button');
    expect(calls).toBeGreaterThan(before);
  });
});
