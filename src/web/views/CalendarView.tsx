// ---------------------------------------------------------------------------
// 改动日历
// 左侧按周排布的日历热力格，右侧统计卡与提交列表随鼠标所在日期联动。
// ---------------------------------------------------------------------------
import { useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { CalendarData, GroupStat } from '../../core/types.js';
import { formatNumber as f } from '../lib/format.js';
import { useLabel } from '../lib/i18n.js';

/** 日历格宽度，与 styles.css 的 --cw 一致。 */
const CELL_W = 36;

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
function buildLayout(range: { min: string; max: string }, months: readonly string[]): CalendarLayout {
  if (!range.min || !range.max) {
    return EMPTY_LAYOUT;
  }
  const startMonday = parseDate(range.min);
  startMonday.setDate(startMonday.getDate() - ((startMonday.getDay() + 6) % 7));
  const endSunday = parseDate(range.max);
  endSunday.setDate(endSunday.getDate() + (6 - (endSunday.getDay() + 6) % 7));

  const weeks: Array<Array<string | undefined>> = [];
  let week: Array<string | undefined> = new Array<string | undefined>(7).fill(undefined);
  const labels: MonthLabel[] = [];
  let lastMonth = -1;
  for (let cursor = new Date(startMonday), i = 0; cursor <= endSunday; cursor.setDate(cursor.getDate() + 1), i += 1) {
    const dow = (cursor.getDay() + 6) % 7;
    if (dow === 0 && i !== 0) {
      weeks.push(week);
      week = new Array<string | undefined>(7).fill(undefined);
    }
    week[dow] = formatDate(cursor);
    if (cursor.getMonth() !== lastMonth && cursor.getDate() <= 7) {
      labels.push({ col: weeks.length, name: months[cursor.getMonth()] ?? '' });
      lastMonth = cursor.getMonth();
    }
  }
  weeks.push(week);
  return { weeks, months: labels };
}

export interface CalendarViewProps {
  data: CalendarData | undefined;
  error: string | undefined;
  /** 当前查看的分组，all 表示全部。 */
  mode: string;
  hidden: boolean;
}

export function CalendarView({ data, error, mode, hidden }: CalendarViewProps) {
  const { t } = useTranslation();
  const label = useLabel();
  const [hoverDate, setHoverDate] = useState<string | undefined>(undefined);

  // 月份与星期的短标签放在文案里，日历格子很窄，用的是固定短名
  const months = t('calendar.months', { returnObjects: true }) as unknown as string[];
  const weekdays = t('calendar.weekdays', { returnObjects: true }) as unknown as string[];
  const layout = useMemo(() => (data ? buildLayout(data.range, months) : EMPTY_LAYOUT), [data, months]);

  const maxVal = Math.max(1, data?.maxVal ?? 1);
  const barW = (value: number): number =>
    value <= 0 ? 0 : Math.max(3, Math.round(Math.sqrt(value / maxVal) * CELL_W));

  const days = data?.totals.days ?? 0;
  const cards: Array<{ id: string; label: string }> =
    data && data.groups.length > 0 ? data.groups.map((group) => ({ id: group.id, label: label(group) })) : [{ id: 'all', label: '' }];
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
              {weekdays.map((name, i) => (
                <span key={i}>{name}</span>
              ))}
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
              {t('calendar.add')}
            </div>
            <div className="legend-item">
              <span className="sw" style={{ background: 'var(--red)' }} />
              {t('calendar.del')}
            </div>
            <div className="legend-item" style={{ color: 'var(--muted)' }}>
              {t('calendar.scale', { max: f(maxVal) })}
            </div>
          </div>
        </div>

        <div className={`stats-ctx${live ? ' live' : ''}`}>
          {hoverDate ? t('calendar.contextDay', { date: hoverDate }) : t('calendar.contextRange')}
        </div>
        <div className={`stats${live ? ' live' : ''}`} style={{ gridTemplateColumns: `repeat(${cards.length * 2}, 1fr)` }}>
          {cards.map((group) => {
            const stat = statOf(group.id);
            const named = group.label !== '';
            return [
              <div className="stat" key={`${group.id}-commits`}>
                <div className="k">
                  {named ? t('calendar.statCommits', { prefix: group.label }) : t('calendar.statCommitsAll')}
                </div>
                <div className="v">{f(stat.commits)}</div>
                <div className="s">{days > 0 ? t('calendar.avgCommits', { value: (stat.commits / days).toFixed(1) }) : '—'}</div>
              </div>,
              <div className="stat" key={`${group.id}-lines`}>
                <div className="k">
                  {named ? t('calendar.statLines', { prefix: group.label }) : t('calendar.statLinesAll')}
                </div>
                <div className="v">
                  <span className="plus">{`+${f(stat.add)}`}</span> <span className="minus">{`-${f(stat.del)}`}</span>
                </div>
                <div className="s">
                  {days > 0 ? t('calendar.avgLines', { value: f(Math.round((stat.add + stat.del) / days)) }) : '—'}
                </div>
              </div>,
            ];
          })}
        </div>

        <div className="commits-card">
          <div className={`commits-head${live ? ' live' : ''}`}>
            {commitDate === ''
              ? t('calendar.headNone')
              : t('calendar.headDay', {
                  date: commitDate,
                  commits: commitDay
                    ? t('calendar.commitsCount', { count: commitDay.commits.length })
                    : t('calendar.commitsNone'),
                })}
          </div>
          <div className="commit-list">
            {!commitDay || commitDay.commits.length === 0 ? (
              <div className="commit-empty">{t('calendar.empty')}</div>
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
        <Trans i18nKey="calendar.loadError" values={{ error: error ?? '' }} components={{ code: <code /> }} />
      </div>
    </section>
  );
}
