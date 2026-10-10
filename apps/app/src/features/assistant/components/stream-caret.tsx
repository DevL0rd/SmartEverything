import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Text as NativeText } from 'react-native';
import { useForeground } from '../../../design/animation-gate';
import { useMotion } from '../../../design/motion';

const STEP_MS = 530;

export function StreamCaret(): ReactNode {
  const { reduced } = useMotion();
  const foreground = useForeground();
  const [beat, setBeat] = useState(0);
  const blinking = !reduced && foreground;
  useEffect(() => {
    if (!blinking) {
      return undefined;
    }
    const timer = setInterval(() => {
      setBeat((current) => current + 1);
    }, STEP_MS);
    return (): void => {
      clearInterval(timer);
    };
  }, [blinking]);
  const on = !blinking || beat % 2 === 0;
  return (
    <NativeText aria-hidden className={on ? 'text-primary' : 'text-transparent'}>
      {' ▍'}
    </NativeText>
  );
}
