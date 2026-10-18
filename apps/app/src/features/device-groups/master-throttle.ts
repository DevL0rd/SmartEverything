export const MASTER_LIVE_INTERVAL_MS = 125;

export interface TrailingThrottle<T> {
  readonly push: (value: T) => void;
  readonly commit: (value: T) => void;
}

export function trailingThrottle<T>(
  send: (value: T, committed: boolean) => void,
  intervalMs: number = MASTER_LIVE_INTERVAL_MS,
): TrailingThrottle<T> {
  let sentAt = Number.NEGATIVE_INFINITY;
  let waiting: { readonly value: T } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const deliver = (value: T, committed: boolean): void => {
    sentAt = Date.now();
    send(value, committed);
  };
  const cancel = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    waiting = null;
  };
  return {
    push: (value: T): void => {
      const remaining = sentAt + intervalMs - Date.now();
      if (remaining <= 0 && timer === null) {
        deliver(value, false);
        return;
      }
      waiting = { value };
      if (timer !== null) return;
      timer = setTimeout(
        () => {
          const next = waiting;
          timer = null;
          waiting = null;
          if (next !== null) deliver(next.value, false);
        },
        Math.max(0, remaining),
      );
    },
    commit: (value: T): void => {
      cancel();
      deliver(value, true);
    },
  };
}
