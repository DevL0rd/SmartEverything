import { useEffect, useState } from 'react';

export function useSettledMount(settled: boolean, streamed: boolean): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!streamed || !settled || ready) {
      return undefined;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const frame = requestAnimationFrame(() => {
      timer = setTimeout(() => {
        setReady(true);
      }, 0);
    });
    return (): void => {
      cancelAnimationFrame(frame);
      if (timer !== null) {
        clearTimeout(timer);
      }
    };
  }, [streamed, settled, ready]);
  return settled && (!streamed || ready);
}
