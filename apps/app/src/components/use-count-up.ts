import { useEffect, useRef, useState } from 'react';
import { DURATION } from '../design/motion';
import { tween } from './use-tween';

const NUMBER = /^-?\d+(\.\d+)?$/;

interface Parsed {
  readonly value: number;
  readonly decimals: number;
}

function parse(written: string): Parsed | null {
  if (!NUMBER.test(written)) {
    return null;
  }
  return { value: Number(written), decimals: written.split('.')[1]?.length ?? 0 };
}

export function useCountUp(value: string, enabled: boolean): string {
  const [shown, setShown] = useState(value);
  const previous = useRef(value);
  useEffect(() => {
    const from = parse(previous.current);
    const to = parse(value);
    previous.current = value;
    if (!enabled || from === null || to === null || from.value === to.value) {
      setShown(value);
      return undefined;
    }
    return tween(from.value, to.value, DURATION.long, (current) => {
      setShown(current.toFixed(to.decimals));
    });
  }, [value, enabled]);
  return shown;
}
