export interface CommitQueue<T> {
  readonly push: (value: T) => void;
  readonly flush: () => void;
  readonly retarget: (save: (value: T) => Promise<unknown>) => void;
}

export function commitQueue<T>(
  initial: (value: T) => Promise<unknown>,
  delayMs: number,
  onFailed: () => void,
): CommitQueue<T> {
  let save = initial;
  let pending: { readonly value: T; readonly timer: ReturnType<typeof setTimeout> } | null = null;
  const flush = (): void => {
    if (pending === null) {
      return;
    }
    const { value, timer } = pending;
    pending = null;
    clearTimeout(timer);
    save(value).catch(onFailed);
  };
  return {
    push: (value): void => {
      if (pending !== null) {
        clearTimeout(pending.timer);
      }
      pending = { value, timer: setTimeout(flush, delayMs) };
    },
    flush,
    retarget: (next): void => {
      save = next;
    },
  };
}
