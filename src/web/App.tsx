// ---------------------------------------------------------------------------
// 页面装配
// 顶部切换视图与分组，两个视图常驻在 DOM 里，切换只改变 hidden。
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import type { CalendarData, LocData } from '../core/types.js';
import { Seg } from './components/Seg.js';
import { useJson } from './lib/use-json.js';
import { CalendarView } from './views/CalendarView.js';
import { LocView } from './views/LocView.js';

const VIEW_OPTIONS = [
  { value: 'calendar', label: '改动日历' },
  { value: 'loc', label: '代码行数' },
];

export function App() {
  const [view, setView] = useState('calendar');
  const [mode, setMode] = useState('all');
  const calendar = useJson<CalendarData>('/api/data.json');
  const loc = useJson<LocData>('/api/loc.json');

  const isCalendar = view === 'calendar';
  const title = isCalendar ? '代码改动日历' : '代码行数';
  const modes = [
    { value: 'all', label: '全部' },
    ...(calendar.data?.groups ?? []).map((group) => ({ value: group.id, label: group.label })),
  ];
  const range = calendar.data
    ? `${calendar.data.range.min} ~ ${calendar.data.range.max} · ${calendar.data.totals.days} 天有提交`
    : '';

  useEffect(() => {
    document.title = title;
  }, [title]);

  // 分组由数据决定，取到的分组里没有当前选中项时回到全部
  useEffect(() => {
    setMode((prev) => (modes.some((option) => option.value === prev) ? prev : 'all'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendar.data]);

  return (
    <>
      <header>
        <div className="header-inner">
          <h1>
            <span>{title}</span>
            {/* 仓库名与时间范围只在日历视图有意义 */}
            <span className="range" hidden={!isCalendar || calendar.data === undefined}>
              {range}
            </span>
          </h1>
          <div className="header-controls">
            <Seg options={VIEW_OPTIONS} value={view} onChange={setView} />
            <Seg options={modes} value={mode} onChange={setMode} hidden={!isCalendar || modes.length < 2} />
          </div>
        </div>
      </header>
      <main>
        <CalendarView data={calendar.data} error={calendar.error} mode={mode} hidden={!isCalendar} />
        <LocView data={loc.data} error={loc.error} hidden={isCalendar} />
      </main>
    </>
  );
}
