import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { EASING, useMotion } from '../../../design/motion';
import { ROW_RISE } from './thread-motion';

export function Rise({
  from,
  duration,
  delay = 0,
  className,
  children,
}: {
  readonly from: number;
  readonly duration: number;
  readonly delay?: number;
  readonly className?: string;
  readonly children: ReactNode;
}): ReactNode {
  const { reduced } = useMotion();
  const progress = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    progress.set(
      reduced ? 1 : withDelay(delay, withTiming(1, { duration, easing: EASING.decelerate })),
    );
  }, [reduced, delay, duration, progress]);
  const style = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ translateY: (1 - progress.get()) * from }],
  }));
  return (
    <Animated.View style={style} {...(className === undefined ? {} : { className })}>
      {children}
    </Animated.View>
  );
}

export interface EntryLedger {
  readonly claim: (identity: string, at: string) => boolean;
}

export function entryLedger(openedAt: number): EntryLedger {
  const entered = new Set<string>();
  return {
    claim: (identity: string, at: string): boolean => {
      if (Date.parse(at) <= openedAt || entered.has(identity)) return false;
      entered.add(identity);
      return true;
    },
  };
}

export function RowEntry({
  ledger,
  identity,
  at,
  children,
}: {
  readonly ledger: EntryLedger;
  readonly identity: string;
  readonly at: string;
  readonly children: ReactNode;
}): ReactNode {
  const [fresh] = useState(() => ledger.claim(identity, at));
  if (!fresh) return children;
  return (
    <Rise from={ROW_RISE.px} duration={ROW_RISE.ms}>
      {children}
    </Rise>
  );
}
