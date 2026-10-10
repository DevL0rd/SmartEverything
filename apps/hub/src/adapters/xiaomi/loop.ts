export interface Loop {
  readonly stop: () => void;
}

export function startLoop(intervalMs: () => number, task: () => Promise<void>): Loop {
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  const schedule = (): void => {
    timer = setTimeout(() => {
      void task().finally(() => {
        if (!stopped) {
          schedule();
        }
      });
    }, intervalMs());
  };
  schedule();
  return {
    stop: (): void => {
      stopped = true;
      if (timer !== null) {
        clearTimeout(timer);
      }
    },
  };
}
