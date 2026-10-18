import type { WakeTest } from '../src/wake-name/wake-test';

export const idleWakeTest: Pick<WakeTest, 'active' | 'onActive' | 'matched' | 'near' | 'segment'> =
  {
    active: (): boolean => false,
    onActive: (): (() => void) => (): void => undefined,
    matched: (): void => undefined,
    near: (): void => undefined,
    segment: (): void => undefined,
  };
