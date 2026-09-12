// ---------------------------------------------------------------------------
// 开关
// ---------------------------------------------------------------------------
import type { ReactNode } from 'react';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  children: ReactNode;
}

export function Switch({ checked, onChange, title, children }: SwitchProps) {
  return (
    <label className="sw-item" title={title}>
      {/* aria-label 固定在 title 上：开关文字会随状态变化，不该让读屏器听到的名字跟着变 */}
      <input
        type="checkbox"
        checked={checked}
        aria-label={title}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="track" aria-hidden="true" />
      {children}
    </label>
  );
}
