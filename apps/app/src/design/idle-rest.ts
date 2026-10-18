import { RearmTimer } from './rearm-timer';

export class IdleRest {
  private readonly timer: RearmTimer;

  constructor(
    private readonly ms: number,
    private readonly onChange: (resting: boolean) => void,
  ) {
    this.timer = new RearmTimer(() => {
      this.onChange(true);
    });
  }

  wake(): void {
    this.onChange(false);
    this.arm();
  }

  arm(): void {
    this.timer.rearm(this.ms);
  }

  cancel(): void {
    this.timer.cancel();
  }
}

const touchListeners = new Set<() => void>();

export function noteTouch(): void {
  for (const listener of touchListeners) {
    listener();
  }
}

export function onTouch(listener: () => void): () => void {
  touchListeners.add(listener);
  return (): void => {
    touchListeners.delete(listener);
  };
}

export function followIdle(rest: IdleRest, idle: boolean): void {
  if (idle) {
    rest.wake();
  } else {
    rest.cancel();
  }
}
