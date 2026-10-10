const LONGEST_TIMER_MS = 2_147_483_647;

export type Cancel = () => void;

export interface Clock {
  readonly now: () => Date;
  readonly at: (moment: Date, action: () => void) => Cancel;
  readonly sleep: (milliseconds: number) => Promise<void>;
}

export const systemClock: Clock = {
  now: () => new Date(),
  at: (moment, action) => {
    let timer: NodeJS.Timeout;
    const arm = (): void => {
      const remaining = moment.getTime() - Date.now();
      timer = setTimeout(
        remaining > LONGEST_TIMER_MS ? arm : action,
        Math.min(Math.max(remaining, 0), LONGEST_TIMER_MS),
      );
    };
    arm();
    return () => {
      clearTimeout(timer);
    };
  },
  sleep: (milliseconds) =>
    new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    }),
};
