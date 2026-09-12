// ---------------------------------------------------------------------------
// 改动日历
// 左侧按周排布的日历热力格，右侧统计卡与提交列表随鼠标所在日期联动。
// ---------------------------------------------------------------------------
import { useMemo, useState } from 'react';
import type { CalendarData, GroupStat } from '../../core/types.js';
import { formatNumber as f } from '../lib/format.js';

/** 日历格宽度，与 styles.css 的 --cw 一致。 */
const CELL_W = 36;
const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

const ZERO: GroupStat = { commits: 0, add: 0, del: 0 };

interface MonthLabel {
  col: number;
  name: string;
}

interface CalendarLayout {
  /** 每周一列，7 行对应周一到周日，范围内之外为 undefined。 */
  weeks: Array<Array<string | undefined>>;
  months: MonthLabel[];
}

const EMPTY_LAYOUT: CalendarLayout = { weeks: [], months: [] };

function parseDate(text: string): Date {
  const [y, m, d] = text.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** 把日期区间对齐到整周，列数即周数。 */
function buildLayout(range: { min: string; max: string }): CalendarLayout {
  if (!range.min || !range.max) {
    return EMPTY_LAYOUT;
  }
  const startMonday = parseDate(range.min);
  startMonday.setDate(startMonday.getDate() - ((startMonday.getDay() + 6) % 7));
  const endSunday = parseDate(range.max);
  endSunday.setDate(endSunday.getDate() + (6 - (endSunday.getDay() + 6) % 7));

  const weeks: Array<Array<string | undefined>> = [];
  let week: Array<string | undefined> = new Array<string | undefined>(7).fill(undefined);
  const months: MonthLabel[] = [];
  let lastMonth = -1;
  for (let cursor = new Date(startMonday), i = 0; cursor <= endSunday; cursor.setDate(cursor.getDate() + 1), i += 1) {
    const dow = (cursor.getDay() + 6) % 7;
    if (dow === 0 && i !== 0) {
      weeks.push(week);
      week = new Array<string | undefined>(7).fill(undefined);
    }
    week[dow] = formatDate(cursor);
    if (cursor.getMonth() !== lastMonth && cursor.getDate() <= 7) {
      months.push({ col: weeks.length, name: MONTH_NAMES[cursor.getMonth()] });
      lastMonth = cursor.getMonth();
    }
  }
  weeks.push(week);
  return { weeks, months };
}

export interface CalendarViewProps {
  data: CalendarData | undefined;
  error: string | undefined;
  /** 当前查看的分组，all 表示全部。 */
  mode: string;
  hidden: boolean;
}

export function CalendarView({ data, error, mode, hidden }: CalendarViewProps) {
  const [hoverDate, setHoverDate] = useState<string | undefined>(undefined);
  const layout = useMemo(() => (data ? buildLayout(data.range) : EMPTY_LAYOUT), [data]);

  const maxVal = Math.max(1, data?.maxVal ?? 1);
  const barW = (value: number): number =>
    value <= 0 ? 0 : Math.max(3, Math.round(Math.sqrt(value / maxVal) * CELL_W));

  const days = data?.totals.days ?? 0;
  const cards = data && data.groups.length > 0 ? data.groups : [{ id: 'all', label: '', hue: 214, sat: 58 }];
  const hoverDay = data && hoverDate ? data.days[hoverDate] : undefined;
  const live = hoverDate !== undefined;
  const commitDate = hoverDate ?? data?.range.max ?? '';
  const commitDay = data?.days[commitDate];
  const statOf = (id: string): GroupStat =>
    hoverDate ? (hoverDay?.groups[id] ?? ZERO) : (data?.totals.groups[id] ?? ZERO);

  return (
    <section hidden={hidden}>
      <div hidden={error !== undefined}>
        <div className="card">
          <div className="calendar-wrap">
            <div className="dow-labels">
              <span>一</span>
              <span />
              <span>三</span>
              <span />
              <span>五</span>
              <span />
              <span>日</span>
            </div>
            <div className="grid-area">
              <div className="month-row" style={{ gridTemplateColumns: `repeat(${layout.weeks.length}, var(--cw))` }}>
                {layout.months.map((month) => (
                  <span className="month-label" key={`${month.col}-${month.name}`} style={{ gridColumn: String(month.col + 1) }}>
                    {month.name}
                  </span>
                ))}
              </div>
              <div className="grid">
                {[0, 1, 2, 3, 4, 5, 6].map((dow) => (
                  <div className="row" key={dow}>
                    {layout.weeks.map((week, index) => {
                      const date = week[dow];
                      if (!date) {
                        return <div className="cell pad" key={index} />;
                      }
                      const stat = data?.days[date]?.groups[mode] ?? ZERO;
                      const churn = stat.add + stat.del;
                      const classes = ['cell'];
                      if (date === data?.range.max) {
                        classes.push('today');
                      }
                      if (mode !== 'all' && churn === 0) {
                        classes.push('dim');
                      }
                      return (
                        <div
                          className={classes.join(' ')}
                          key={index}
                          onMouseEnter={() => setHoverDate(date)}
                          onMouseLeave={() => setHoverDate(undefined)}
                        >
                          <div className="hbar add" style={{ width: barW(stat.add) }} />
                          <div className="hbar del" style={{ width: barW(stat.del) }} />
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="legend-row">
            <div className="legend-item">
              <span className="sw" style={{ background: 'var(--green)' }} />
              新增行（上条）
            </div>
            <div className="legend-item">
              <span className="sw" style={{ background: 'var(--red)' }} />
              删除行（下条）
            </div>
            <div className="legend-item" style={{ color: 'var(--muted)' }}>
              {`条宽 = 行数量级，平方根刻度，峰值 ${f(maxVal)} 行/天`}
            </div>
          </div>
        </div>

        <div className={`stats-ctx${live ? ' live' : ''}`}>{hoverDate ? `${hoverDate} 当日` : '区间汇总'}</div>
        <div className={`stats${live ? ' live' : ''}`} style={{ gridTemplateColumns: `repeat(${cards.length * 2}, 1fr)` }}>
          {cards.map((group) => {
            const stat = statOf(group.id);
            const prefix = group.label;
            return [
              <div className="stat" key={`${group.id}-commits`}>
                <div className="k">{`${prefix}提交`}</div>
                <div className="v">{f(stat.commits)}</div>
                <div className="s">{days > 0 ? `日均 ${(stat.commits / days).toFixed(1)} 次` : '—'}</div>
              </div>,
              <div className="stat" key={`${group.id}-lines`}>
                <div className="k">{`${prefix}改动行`}</div>
                <div className="v">
                  <span className="plus">{`+${f(stat.add)}`}</span> <span className="minus">{`-${f(stat.del)}`}</span>
                </div>
                <div className="s">{days > 0 ? `日均 ${f(Math.round((stat.add + stat.del) / days))} 行` : '—'}</div>
              </div>,
            ];
          })}
        </div>

        <div className="commits-card">
          <div className={`commits-head${live ? ' live' : ''}`}>
            {commitDate === ''
              ? '区间内没有提交'
              : `${commitDate} · ${commitDay ? `${commitDay.commits.length} 个提交` : '无提交'}`}
          </div>
          <div className="commit-list">
            {!commitDay || commitDay.commits.length === 0 ? (
              <div className="commit-empty">当日没有提交记录。</div>
            ) : (
              commitDay.commits.map((commit) => {
                const total = commit.groups.all ?? ZERO;
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
        {`无法读取改动数据（${error ?? ''}）。请通过 `}
        <code>codelens</code>
        {` 启动页面后访问，数据由它随服务一起生成。`}
      </div>
    </section>
  );
}
