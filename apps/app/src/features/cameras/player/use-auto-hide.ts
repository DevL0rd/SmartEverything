import { useEffect, useState } from 'react';

const SHOWN_MS = 3000;

export interface AutoHide {
  readonly visible: boolean;
  readonly poke: () => void;
  readonly toggle: () => void;
}

export function useAutoHide(active: boolean): AutoHide {
  const [shownAt, setShownAt] = useState<number | null>(() => Date.now());
  const visible = !active || shownAt !== null;
  useEffect(() => {
    if (!active || shownAt === null) {
      return undefined;
    }
    const timer = setTimeout(() => {
      setShownAt(null);
    }, SHOWN_MS);
    return (): void => {
      clearTimeout(timer);
    };
  }, [active, shownAt]);
  return {
    visible,
    poke: (): void => {
      setShownAt(Date.now());
    },
    toggle: (): void => {
      setShownAt(visible ? null : Date.now());
    },
  };
}
