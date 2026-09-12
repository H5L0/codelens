// ---------------------------------------------------------------------------
// 分段开关
// 点击切换选中项，滑动指示块跟随移动；用 offsetLeft/offsetWidth 定位，
// 因此显示状态变化（例如切回日历视图）时需要重新摆正。
// ---------------------------------------------------------------------------
import { useLayoutEffect, useRef } from 'react';

export interface SegOption {
  value: string;
  label: string;
}

export interface SegProps {
  options: readonly SegOption[];
  value: string;
  onChange: (value: string) => void;
  hidden?: boolean;
}

export function Seg({ options, value, onChange, hidden = false }: SegProps) {
  const segRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const seg = segRef.current;
    const pill = pillRef.current;
    if (!seg || !pill) {
      return;
    }
    const move = (): void => {
      const button = seg.querySelector<HTMLButtonElement>('button.active') ?? seg.querySelector<HTMLButtonElement>('button');
      if (!button) {
        return;
      }
      pill.style.left = `${button.offsetLeft}px`;
      pill.style.width = `${button.offsetWidth}px`;
    };
    move();
    window.addEventListener('resize', move);
    return () => window.removeEventListener('resize', move);
  }, [value, options.length, hidden]);

  return (
    <div className="seg" ref={segRef} hidden={hidden}>
      <span className="seg-pill" ref={pillRef} />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === value ? 'active' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
