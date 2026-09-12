// ---------------------------------------------------------------------------
// 日历排布
// 把一段日期对齐到整周排成网格：每周一列、周一到周日七行，供热力格直接渲染；
// 底部拖动条该画哪几格（包裹框固定在中间）也在这里算。
// ---------------------------------------------------------------------------

interface MonthLabel {
  col: number;
  name: string;
}

interface CalendarLayout {
  /** 每周一列，7 行对应周一到周日。 */
  weeks: Array<Array<string | undefined>>;
  months: MonthLabel[];
}

export const EMPTY_LAYOUT: CalendarLayout = { weeks: [], months: [] };

/** 超过这么多天没有提交，显示窗口就停在上次提交那天，不再往后铺空格子。 */
const STALE_DAYS = 28;

const DAY_MS = 24 * 60 * 60 * 1000;

export function parseDate(text: string): Date {
  const [y, m, d] = text.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * 显示窗口的结束日：
 * 仓库还在更新（最后一次提交距今不超过 28 天）就一直显示到今天，否则停在最后一次提交，
 * 免得荒了几个月的仓库右边挂一大片空网格。
 */
export function displayEnd(maxText: string, todayText: string): string {
  if (!maxText) {
    return todayText;
  }
  const gap = Math.round((parseDate(todayText).getTime() - parseDate(maxText).getTime()) / DAY_MS);
  if (gap > STALE_DAYS) {
    return maxText;
  }
  // 提交日期跑到今天之后（时区或手改过的提交）时以提交为准，别把它裁掉
  return todayText > maxText ? todayText : maxText;
}

/** 日期往后挪几天，负数就是往前。 */
export function shiftDays(text: string, days: number): string {
  const date = parseDate(text);
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

/** 某天所在周的周一。 */
function mondayOf(date: Date): Date {
  const monday = new Date(date);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

/** 某天所在周的周日。 */
function sundayOf(date: Date): Date {
  const sunday = mondayOf(date);
  sunday.setDate(sunday.getDate() + 6);
  return sunday;
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

/** 首尾之间有多少个整周列，首尾不足一周的也算进去。 */
export function weekCount(startText: string, endText: string): number {
  if (!startText || !endText) {
    return 0;
  }
  return Math.floor(daysBetween(mondayOf(parseDate(startText)), sundayOf(parseDate(endText))) / 7) + 1;
}

/** 某天落在第几周：起始日所在周算第 0 周，比它早的话是负数。 */
export function weekIndex(startText: string, dateText: string): number {
  if (!startText || !dateText) {
    return -1;
  }
  return Math.floor(daysBetween(mondayOf(parseDate(startText)), mondayOf(parseDate(dateText))) / 7);
}

/** 起始周往后数第 offset 周，那一周的周一。 */
export function weekStart(startText: string, offset: number): string {
  const monday = mondayOf(parseDate(startText));
  monday.setDate(monday.getDate() + offset * 7);
  return formatDate(monday);
}

/** 一段宽度里排得下几个格子（格子宽 cell、间距 gap）。 */
export function fitCells(width: number, cell: number, gap: number): number {
  return Math.max(1, Math.floor((width + gap) / (cell + gap)));
}

export interface StripWindow {
  /** 从第几周开始画；负数表示条的开头在数据之前，那几格留空。 */
  from: number;
  /** 一共画几格。 */
  count: number;
  /** 包裹框从第几格开始：固定在条中间。 */
  center: number;
}

/**
 * 拖动条上要画哪一段：条永远铺满容器（放得下几格就画几格），包裹框固定在条中间。
 * 窗口的第一周 `start` 落在框里，所以从 start 往前挪半个条的长度就是条的第一格；
 * 历史比条短时两端照样留出来，由视图把那几格画成空的，框仍然居中。
 */
export function stripWindow(cells: number, visible: number, start: number): StripWindow {
  const count = Math.max(0, cells);
  const center = Math.max(0, Math.floor((count - visible) / 2));
  return { from: start - center, count, center };
}

/**
 * 月份标签落在窗口第一天与之后每个月的 1 号：
 * 只看每月 1 号会漏掉首月（窗口常从某个月中间开始）。
 * 窗口两端会补上整周，但那几天不参与月份标签，免得蹭出个半格的月份。
 */
export function buildLayout(startText: string, endText: string, months: readonly string[]): CalendarLayout {
  if (!startText || !endText) {
    return EMPTY_LAYOUT;
  }
  const min = parseDate(startText);
  const max = parseDate(endText);
  const startMonday = mondayOf(min);
  const endSunday = sundayOf(max);

  const weeks: Array<Array<string | undefined>> = [];
  let week: Array<string | undefined> = new Array<string | undefined>(7).fill(undefined);
  const labels: MonthLabel[] = [];
  const seen = new Set<string>();
  let first = true;
  for (let cursor = new Date(startMonday), i = 0; cursor <= endSunday; cursor.setDate(cursor.getDate() + 1), i += 1) {
    const dow = (cursor.getDay() + 6) % 7;
    if (dow === 0 && i !== 0) {
      weeks.push(week);
      week = new Array<string | undefined>(7).fill(undefined);
    }
    week[dow] = formatDate(cursor);
    // 两端补出来的整周格子不参与月份标签
    const inRange = cursor >= min && cursor <= max;
    if (inRange && (first || cursor.getDate() === 1)) {
      first = false;
      const key = `${weeks.length}-${cursor.getMonth()}`;
      if (!seen.has(key)) {
        seen.add(key);
        // 一列只放一个标签：窗口第一天可能与当月 1 号落在同一列，这时留 1 号那个
        if (cursor.getDate() === 1) {
          const stale = labels.findIndex((label) => label.col === weeks.length);
          if (stale >= 0) {
            labels.splice(stale, 1);
          }
        }
        labels.push({ col: weeks.length, name: months[cursor.getMonth()] ?? '' });
      }
    }
  }
  weeks.push(week);
  return { weeks, months: labels };
}
