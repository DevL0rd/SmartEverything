import type { RingClock } from './ring-types.js';

const LONGEST_TIMER_MS = 2_147_483_647;

export const systemRingClock: RingClock = {
  now: () => new Date(),
  at: (moment, action) => {
    let timer: NodeJS.Timeout | undefined;
    const target = moment.getTime();
    const arm = (): void => {
      const remaining = Math.max(target - Date.now(), 0);
      timer =
        remaining > LONGEST_TIMER_MS
          ? setTimeout(arm, LONGEST_TIMER_MS)
          : setTimeout(action, remaining);
    };
    arm();
    return () => {
      clearTimeout(timer);
    };
  },
};
