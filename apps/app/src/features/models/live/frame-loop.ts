export interface FrameScheduler {
  readonly request: (callback: (nowMs: number) => void) => number;
  readonly cancel: (handle: number) => void;
  readonly now: () => number;
}

export interface FrameLoop {
  readonly setActive: (active: boolean) => void;
  readonly invalidate: () => void;
  readonly pending: () => boolean;
  readonly dispose: () => void;
}

export interface FrameLoopSetup {
  readonly scheduler: FrameScheduler;
  readonly step: (nowMs: number) => boolean;
  readonly onFrameTime: (frameMs: number) => boolean;
}

export function browserScheduler(): FrameScheduler {
  return {
    request: (callback): number => requestAnimationFrame(callback),
    cancel: (handle): void => {
      cancelAnimationFrame(handle);
    },
    now: (): number => performance.now(),
  };
}

export function createFrameLoop({ scheduler, step, onFrameTime }: FrameLoopSetup): FrameLoop {
  let active = false;
  let handle: number | null = null;
  const run = (nowMs: number): void => {
    handle = null;
    if (!active) return;
    const started = scheduler.now();
    const moving = step(nowMs);
    const changed = onFrameTime(scheduler.now() - started);
    if (moving || changed) request();
  };
  const request = (): void => {
    if (active && handle === null) handle = scheduler.request(run);
  };
  const stop = (): void => {
    if (handle !== null) scheduler.cancel(handle);
    handle = null;
  };
  return {
    setActive: (next): void => {
      if (next === active) return;
      active = next;
      if (active) request();
      else stop();
    },
    invalidate: request,
    pending: (): boolean => handle !== null,
    dispose: (): void => {
      active = false;
      stop();
    },
  };
}
