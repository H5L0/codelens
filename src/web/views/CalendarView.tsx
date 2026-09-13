// ---------------------------------------------------------------------------
// 改动日历
// 一屏放得下几周就铺几周，靠右贴着最新的一周；底部的拖动条用来平移这个窗口，
// 右侧统计卡与提交列表随指针或键盘焦点联动；点一下某天可以钉住它，鼠标移开也不复位。
// ---------------------------------------------------------------------------
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { CalendarData, GroupStat } from '../../core/types.js';
import {
  EMPTY_LAYOUT,
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
} from '../lib/calendar.js';
import { formatLocalDate, formatNumber as f } from '../lib/format.js';
import { useLabel } from '../lib/i18n.js';

/** 日历格宽度与间距，跟着 styles.css 的 --cw 与 --gap 走。 */
const CELL_W = 36;
const CELL_GAP = 4;
/** 拖动条上的一格：细高的小格子，一格一周。 */
const STRIP_W = 5;
const STRIP_GAP = 2;
const STRIP_PITCH = STRIP_W + STRIP_GAP;

const ZERO: GroupStat = { commits: 0, add: 0, del: 0 };

/** 方向键一次移动的天数：左右各一天，上下各一周。 */
const ARROWS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

/** 把日期收进数据范围内：两端补出来的整周不算进显示范围。 */
const clampText = (text: string, low: string, high: string): string => (text < low ? low : text > high ? high : text);

/** 拖动时把指针捉在条上，滑出条外也不丢；环境不支持指针捕获就算了。 */
function capture(track: HTMLElement, id: number, on: boolean): void {
  try {
    if (on) {
      track.setPointerCapture?.(id);
    } else {
      track.releasePointerCapture?.(id);
    }
  } catch {
    /* 没有指针捕获时事件照样冒泡，只是拖到条外会断 */
  }
}

interface CalendarViewProps {
  data: CalendarData | undefined;
  error: string | undefined;
  /** 数据加载失败后的重试。 */
  onRetry: () => void;
  /** 当前查看的分组，all 表示全部。 */
  mode: string;
  hidden: boolean;
}

export function CalendarView({ data, error, onRetry, mode, hidden }: CalendarViewProps) {
  const { t, i18n } = useTranslation();
  const label = useLabel();
  const [hoverDate, setHoverDate] = useState<string | undefined>(undefined);
  const [pinned, setPinned] = useState<string | undefined>(undefined);
  const [focusDate, setFocusDate] = useState('');
  /** 一屏放得下的周数与拖动条格数，量出来之前先按数据自己的宽度画 */
  const [cols, setCols] = useState(0);
  const [slots, setSlots] = useState(0);
  /** 窗口从第几周开始；undefined 表示贴着最新的一周 */
  const [startWeek, setStartWeek] = useState<number | undefined>(undefined);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; base: number } | undefined>(undefined);
  const cells = useRef(new Map<string, HTMLButtonElement>());
  const listRef = useRef<HTMLDivElement>(null);
  const colRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  // 月份与星期的短标签放在文案里，日历格子很窄，用的是固定短名
  const months = useMemo(() => t('calendar.months', { returnObjects: true }) as unknown as string[], [t]);
  const weekdays = useMemo(() => t('calendar.weekdays', { returnObjects: true }) as unknown as string[], [t]);
  const today = formatDate(new Date());
  const range = data?.range;
  const min = range?.min ?? '';
  // 显示窗口的结束日：最后一次提交距今不超过 28 天就显示到今天，否则停在提交那天
  const end = range?.max ? displayEnd(range.max, today) : '';
  const weeks = useMemo(() => weekCount(min, end), [min, end]);
  /** 一屏铺几周：跟着容器宽度走，宽度还没量到时先按一周算 */
  const visible = Math.max(1, cols > 0 ? cols : 1);
  const lastWeek = Math.max(0, weeks - visible);
  /** 提交全在一屏里就没得可挪，拖动条也不出现 */
  const showStrip = lastWeek > 0;
  /** 窗口左端在第几周：数据不够一屏时为负，窗口往左铺满、最右一列仍停在数据末尾 */
  const first = weeks < visible ? weeks - visible : Math.min(Math.max(startWeek ?? lastWeek, 0), lastWeek);
  const windowStart = min && end ? weekStart(min, first) : '';
  const layout = useMemo(
    () => (windowStart ? buildLayout(windowStart, shiftDays(windowStart, visible * 7 - 1), months) : EMPTY_LAYOUT),
    [windowStart, visible, months],
  );
  // 顶部那行的时间范围：两端补出来的整周不算，所以收进数据范围里；显示给用户的日期按本地写法
  const weekMonday = layout.weeks[0]?.[0] ?? '';
  const weekSunday = layout.weeks[layout.weeks.length - 1]?.[6] ?? '';
  const shownFrom = range && weekMonday ? clampText(weekMonday, range.min, range.max) : '';
  const shownTo = range && weekSunday ? clampText(weekSunday, range.min, range.max) : '';
  /** 卡片头部与拖动条读数共用的一句话。 */
  const rangeText = shownFrom
    ? t('calendar.windowRange', { start: formatLocalDate(shownFrom, i18n.language), end: formatLocalDate(shownTo, i18n.language) })
    : '';

  const maxVal = Math.max(1, data?.maxVal ?? 1);
  const maxCommits = Math.max(1, data?.maxCommits ?? 1);
  const barW = (value: number): number =>
    value <= 0 ? 0 : Math.max(3, Math.round(Math.sqrt(value / maxVal) * CELL_W));

  // 一周一格的新增行合计（按当前分组），拖动条用它上色
  const weekLines = useMemo(() => {
    const totals = new Array<number>(Math.max(0, weeks)).fill(0);
    if (!data || !min) {
      return totals;
    }
    for (const [date, day] of Object.entries(data.days)) {
      const index = weekIndex(min, date);
      if (index >= 0 && index < totals.length) {
        totals[index] += day.groups[mode]?.add ?? 0;
      }
    }
    return totals;
  }, [data, mode, min, weeks]);
  const weekPeak = Math.max(1, ...weekLines);
  const strip = useMemo(
    () => stripWindow(slots > 0 ? slots : weeks, visible, first),
    [weeks, visible, slots, first],
  );
  /** 那一周的新增行数落在 0~1 上：灰到绿，峰值铺满。 */
  const tint = (value: number): number => (value <= 0 ? 0 : Math.sqrt(value / weekPeak));
  const frameWeeks = Math.min(visible, strip.count);

  const days = data?.totals.days ?? 0;
  const cards: Array<{ id: string; label: string }> =
    data && data.groups.length > 0 ? data.groups.map((group) => ({ id: group.id, label: label(group) })) : [{ id: 'all', label: '' }];
  // 悬停或键盘焦点优先，其次是钉住的日期
  const cursorDate = hoverDate ?? pinned;
  const hoverDay = data && cursorDate ? data.days[cursorDate] : undefined;
  const live = cursorDate !== undefined;
  const commitDate = cursorDate ?? data?.range.max ?? '';
  const commitDay = data?.days[commitDate];
  const groupLabel = cards.find((card) => card.id === mode)?.label ?? '';
  const commitList = useMemo(() => {
    const commits = commitDay?.commits ?? [];
    return mode === 'all' ? commits : commits.filter((commit) => commit.groups[mode]?.commits === 1);
  }, [commitDay, mode]);
  const statOf = (id: string): GroupStat =>
    cursorDate ? (hoverDay?.groups[id] ?? ZERO) : (data?.totals.groups[id] ?? ZERO);

  // 整块网格只有一个格子能被 Tab 键停住，其余靠方向键移动
  const tabbable = focusDate && range && focusDate >= range.min && focusDate <= range.max ? focusDate : (range?.max ?? '');

  // 切换查看的日期时把提交列表滚回顶部
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [commitDate]);

  // 数据换了一批就把窗口重置回最新
  useEffect(() => {
    setStartWeek(undefined);
  }, [range?.min, range?.max]);

  // 容器宽度决定一屏铺几周、条上排几格；隐藏时量出来是 0，保持上一次的结果
  useLayoutEffect(() => {
    const col = colRef.current;
    const stripBox = stripRef.current;
    const measure = (): void => {
      if (col && col.clientWidth > 0) {
        setCols(fitCells(col.clientWidth, CELL_W, CELL_GAP));
      }
      if (stripBox && stripBox.clientWidth > 0) {
        setSlots(fitCells(stripBox.clientWidth, STRIP_W, STRIP_GAP));
      }
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    if (col) {
      observer.observe(col);
    }
    if (stripBox) {
      observer.observe(stripBox);
    }
    return () => observer.disconnect();
  }, [hidden, showStrip]);

  const moveFocus = (from: string, delta: number): void => {
    if (!range?.min || !range.max) {
      return;
    }
    const next = parseDate(from);
    next.setDate(next.getDate() + delta);
    const text = formatDate(next);
    if (text < range.min || text > range.max) {
      return;
    }
    setFocusDate(text);
    setHoverDate(text);
    cells.current.get(text)?.focus();
  };

  const onCellKey = (event: ReactKeyboardEvent<HTMLButtonElement>, date: string): void => {
    const delta = ARROWS[event.key];
    if (delta === undefined) {
      return;
    }
    event.preventDefault();
    moveFocus(date, delta);
  };

  const panTo = (week: number): void => {
    setStartWeek(Math.min(Math.max(week, 0), lastWeek));
  };

  const onStripDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    drag.current = { x: event.clientX, base: first };
    setDragging(true);
    capture(event.currentTarget, event.pointerId, true);
  };

  const onStripMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const state = drag.current;
    if (!state) {
      return;
    }
    // 拖的是格子条：往右拖看到更早的周，往左拖回到更新的周
    panTo(state.base - Math.round((event.clientX - state.x) / STRIP_PITCH));
  };

  const onStripUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!drag.current) {
      return;
    }
    drag.current = undefined;
    setDragging(false);
    capture(event.currentTarget, event.pointerId, false);
  };

  /** 拖动条上的按键：方向键挪一格，翻页键挪一屏，Home / End 到两头。 */
  const onStripKey = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    let to: number | undefined;
    if (event.key === 'ArrowLeft') {
      to = first - 1;
    } else if (event.key === 'ArrowRight') {
      to = first + 1;
    } else if (event.key === 'PageUp') {
      to = first - visible;
    } else if (event.key === 'PageDown') {
      to = first + visible;
    } else if (event.key === 'Home') {
      to = 0;
    } else if (event.key === 'End') {
      to = lastWeek;
    }
    if (to === undefined) {
      return;
    }
    event.preventDefault();
    panTo(to);
  };

  return (
    <section hidden={hidden}>
      <div hidden={error !== undefined}>
        <div className="card">
          <div className="cal-head">
            <span className="cal-range">{rangeText}</span>
            <span className="cal-legend">
              <span className="legend-item">
                <span className="sw" style={{ background: 'var(--green)' }} aria-hidden="true" />
                {t('calendar.add')}
              </span>
              <span className="legend-item">
                <span className="sw" style={{ background: 'var(--red)' }} aria-hidden="true" />
                {t('calendar.del')}
              </span>
            </span>
          </div>
          <div className="calendar-wrap">
            <div className="dow-labels" aria-hidden="true">
              {weekdays.map((name, i) => (
                <span key={i}>{name}</span>
              ))}
            </div>
            <div className="grid-area" ref={colRef}>
              <div className="month-row" style={{ gridTemplateColumns: `repeat(${layout.weeks.length}, var(--cw))` }}>
                {layout.months.map((month) => (
                  <span className="month-label" key={`${month.col}-${month.name}`} style={{ gridColumn: String(month.col + 1) }}>
                    {month.name}
                  </span>
                ))}
              </div>
              <div className="grid" role="grid" aria-label={t('calendar.gridLabel')}>
                {[0, 1, 2, 3, 4, 5, 6].map((dow) => (
                  <div className="row" role="row" key={dow}>
                    {layout.weeks.map((week, index) => {
                      const date = week[dow];
                      if (!date) {
                        return <div className="cell pad" key={index} />;
                      }
                      const stat = data?.days[date]?.groups[mode] ?? ZERO;
                      const churn = stat.add + stat.del;
                      const classes = ['cell'];
                      // 第一次提交之前、最后一次提交之后的日子不算项目历史，画得更深、也不跟着悬浮放大
                      if (!range || date < range.min || date > range.max) {
                        classes.push('out');
                      }
                      if (date === today) {
                        classes.push('today');
                      }
                      if (date === pinned) {
                        classes.push('selected');
                      }
                      if (mode !== 'all' && churn === 0) {
                        classes.push('dim');
                      }
                      return (
                        <button
                          type="button"
                          role="gridcell"
                          className={classes.join(' ')}
                          data-date={date}
                          key={index}
                          ref={(el) => {
                            if (el) {
                              cells.current.set(date, el);
                            } else {
                              cells.current.delete(date);
                            }
                          }}
                          tabIndex={date === tabbable ? 0 : -1}
                          aria-current={date === today ? 'date' : undefined}
                          aria-label={t('calendar.cellLabel', {
                            date: formatLocalDate(date, i18n.language),
                            commits:
                              stat.commits > 0
                                ? t('calendar.commitsCount', { count: stat.commits })
                                : t('calendar.commitsNone'),
                            add: f(stat.add),
                            del: f(stat.del),
                          })}
                          onMouseEnter={() => setHoverDate(date)}
                          onMouseLeave={() => setHoverDate(undefined)}
                          onFocus={() => {
                            setFocusDate(date);
                            setHoverDate(date);
                          }}
                          onBlur={() => setHoverDate(undefined)}
                          onKeyDown={(event) => onCellKey(event, date)}
                          onClick={() => setPinned((prev) => (prev === date ? undefined : date))}
                        >
                          <span className="hbar add" style={{ width: barW(stat.add) }} />
                          <span className="hbar del" style={{ width: barW(stat.del) }} />
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
          {showStrip ? (
            <div className={`scrub${dragging ? ' dragging' : ''}`} ref={stripRef}>
              <div
                className="scrub-track"
                role="slider"
                tabIndex={0}
                aria-label={t('calendar.scrubLabel')}
                aria-valuemin={1}
                aria-valuemax={lastWeek + 1}
                aria-valuenow={first + 1}
                aria-valuetext={rangeText}
                onPointerDown={onStripDown}
                onPointerMove={onStripMove}
                onPointerUp={onStripUp}
                onPointerCancel={onStripUp}
                onKeyDown={onStripKey}
              >
                <span className="scrub-cells" aria-hidden="true">
                  {Array.from({ length: strip.count }, (_, i) => {
                    const week = strip.from + i;
                    // 条的两端会伸到数据之外，那几格留空，不画成"这周没有提交"
                    const outside = week < 0 || week >= weeks;
                    return (
                      <span className={`sc${outside ? ' void' : ''}`} key={week}>
                        <i style={{ opacity: outside ? 0 : tint(weekLines[week] ?? 0) }} />
                      </span>
                    );
                  })}
                </span>
                <span
                  className="scrub-frame"
                  aria-hidden="true"
                  style={{
                    left: `${strip.center * STRIP_PITCH - 2}px`,
                    width: `${frameWeeks * STRIP_PITCH}px`,
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>

        <div className={`stats${live ? ' live' : ''}`}>
          {cards.map((group) => {
            const stat = statOf(group.id);
            const named = group.label !== '';
            return [
              <div className="stat" key={`${group.id}-commits`}>
                <div className="k">
                  {/* 看区间时是累计口径，悬浮或钉住某天才换成当日口径 */}
                  {named
                    ? t('calendar.statCommits', { prefix: group.label, context: live ? undefined : 'range' })
                    : t('calendar.statCommitsAll', { context: live ? undefined : 'range' })}
                </div>
                <div className="v">{f(stat.commits)}</div>
                <div className="s">
                  {days > 0
                    ? t('calendar.avgCommitsPeak', {
                        value: (stat.commits / days).toFixed(1),
                        max: f(maxCommits),
                      })
                    : '—'}
                </div>
              </div>,
              <div className="stat" key={`${group.id}-lines`}>
                <div className="k">
                  {named
                    ? t('calendar.statLines', { prefix: group.label, context: live ? undefined : 'range' })
                    : t('calendar.statLinesAll', { context: live ? undefined : 'range' })}
                </div>
                <div className="v">
                  <span className="plus">{`+${f(stat.add)}`}</span> <span className="minus">{`-${f(stat.del)}`}</span>
                </div>
                <div className="s">
                  {days > 0
                    ? t('calendar.avgLinesPeak', {
                        value: f(Math.round((stat.add + stat.del) / days)),
                        max: f(maxVal),
                      })
                    : '—'}
                </div>
              </div>,
            ];
          })}
        </div>

        <div className="commits-card">
          <div className={`commits-head${live ? ' live' : ''}`}>
            {commitDate === ''
              ? t('calendar.headNone')
              : mode !== 'all'
                ? t('calendar.headDayGroup', {
                    date: formatLocalDate(commitDate, i18n.language),
                    prefix: groupLabel,
                    commits: t('calendar.commitsCount', { count: commitList.length }),
                  })
                : t('calendar.headDay', {
                    date: formatLocalDate(commitDate, i18n.language),
                    commits: commitDay
                      ? t('calendar.commitsCount', { count: commitList.length })
                      : t('calendar.commitsNone'),
                  })}
          </div>
          <div className="commit-list" ref={listRef}>
            {commitList.length === 0 ? (
              <div className="commit-empty">{mode === 'all' ? t('calendar.empty') : t('calendar.emptyGroup')}</div>
            ) : (
              commitList.map((commit) => {
                // 只看某个分组时，列表里的数字也用同一个分组的，和上方统计卡对得上
                const total = commit.groups[mode] ?? ZERO;
                return (
                  <div className="commit" key={commit.hash}>
                    <span className="hash">{commit.hash}</span>
                    <span className="subj">{commit.subject}</span>
                    {total.add + total.del > 0 ? (
                      <span className="nums">
                        <span className="plus">{`+${f(total.add)}`}</span> <span className="minus">{`-${f(total.del)}`}</span>
                      </span>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
      <div className="load-error" hidden={error === undefined}>
        <Trans i18nKey="calendar.loadError" values={{ error: error ?? '' }} components={{ code: <code /> }} />
        <button type="button" onClick={onRetry}>
          {t('loadRetry')}
        </button>
      </div>
    </section>
  );
}
