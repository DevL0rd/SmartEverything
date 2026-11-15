import { use, useEffect, useMemo } from 'react';
import { Gesture, type NativeGesture } from 'react-native-gesture-handler';
import { InnerScrollYield } from './inner-scroll-yield';

export type YieldTo = (gesture: NativeGesture) => () => void;

type ListUpdate = (update: (current: NativeGesture[]) => NativeGesture[]) => void;

export function yieldRegistry(set: ListUpdate): YieldTo {
  return (gesture) => {
    set((current) => [...current, gesture]);
    return (): void => {
      set((current) => current.filter((each) => each !== gesture));
    };
  };
}

export function useInnerScrollGesture(): NativeGesture {
  const yieldTo = use(InnerScrollYield);
  const gesture = useMemo(() => Gesture.Native().disallowInterruption(true), []);
  useEffect(() => (yieldTo === null ? undefined : yieldTo(gesture)), [yieldTo, gesture]);
  return gesture;
}
