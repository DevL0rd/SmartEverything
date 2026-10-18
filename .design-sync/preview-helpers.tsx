import type { ReactNode } from 'react';

export function Col({ children, gap = 12 }: { children: ReactNode; gap?: number }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap }}>{children}</div>;
}

export function Row({ children, gap = 12 }: { children: ReactNode; gap?: number }) {
  return (
    <div
      style={{ display: 'flex', flexDirection: 'row', gap, alignItems: 'center', flexWrap: 'wrap' }}
    >
      {children}
    </div>
  );
}
