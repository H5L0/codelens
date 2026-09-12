// ---------------------------------------------------------------------------
// 开关
// ---------------------------------------------------------------------------
import type { ReactNode } from 'react';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  children: ReactNode;
}

export function Switch({ checked, onChange, title, children }: SwitchProps) {
  return (
    <label className="sw-item" title={title}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="track" />
      {children}
    </label>
  );
}
