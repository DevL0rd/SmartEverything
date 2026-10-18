import { startTransition, useEffect, useState, type ReactNode } from 'react';

export function AfterPaint({ children }: { readonly children: ReactNode }): ReactNode {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      startTransition(() => {
        setReady(true);
      });
    });
    return (): void => {
      cancelAnimationFrame(frame);
    };
  }, []);
  return ready ? children : null;
}
