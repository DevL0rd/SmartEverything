import type { ReactElement, ReactNode } from 'react';

export function Col({ children, gap = 12 }: { children: ReactNode; gap?: number }): ReactElement {
  return <div style={{ display: 'flex', flexDirection: 'column', gap }}>{children}</div>;
}

export function Row({ children, gap = 12 }: { children: ReactNode; gap?: number }): ReactElement {
  return (
    <div
      style={{ display: 'flex', flexDirection: 'row', gap, alignItems: 'center', flexWrap: 'wrap' }}
    >
      {children}
    </div>
  );
}
