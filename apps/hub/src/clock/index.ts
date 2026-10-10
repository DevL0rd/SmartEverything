const LONGEST_TIMER_MS = 2_147_483_647;

export type Cancel = () => void;

export interface Clock {
  readonly now: () => Date;
  readonly at: (moment: Date, action: () => void) => Cancel;
  readonly sleep: (milliseconds: number) => Promise<void>;
}

interface PendingTimer {
  readonly moment: number;
  readonly arm: () => void;
}

const pending = new Set<PendingTimer>();

export function rearmTimers(): void {
  const byDueTime = [...pending].sort((first, second) => first.moment - second.moment);
  for (const timer of byDueTime) {
    timer.arm();
  }
}

export const systemClock: Clock = {
  now: () => new Date(),
  at: (moment, action) => {
    let timer: NodeJS.Timeout | undefined;
    const target = moment.getTime();
    const fire = (): void => {
      pending.delete(entry);
      action();
    };
    const arm = (): void => {
      clearTimeout(timer);
      const remaining = target - Date.now();
      timer = setTimeout(
        remaining > LONGEST_TIMER_MS ? arm : fire,
        Math.min(Math.max(remaining, 0), LONGEST_TIMER_MS),
      );
    };
    const entry: PendingTimer = { moment: target, arm };
    pending.add(entry);
    arm();
    return () => {
      pending.delete(entry);
      clearTimeout(timer);
    };
  },
  sleep: (milliseconds) =>
    new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    }),
};
