export class CallCancelledError extends Error {
  override readonly name = 'CallCancelledError';

  constructor() {
    super('The call was cancelled while waiting for a free slot.');
  }
}

export class CallSlots {
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly limit: number) {}

  async acquire(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    if (this.active < this.limit) {
      this.active += 1;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const grant = (): void => {
        signal.removeEventListener('abort', leave);
        resolve();
      };
      const leave = (): void => {
        this.waiting.splice(this.waiting.indexOf(grant), 1);
        reject(new CallCancelledError());
      };
      this.waiting.push(grant);
      signal.addEventListener('abort', leave, { once: true });
    });
  }

  release(): void {
    const next = this.waiting.shift();
    if (next === undefined) this.active -= 1;
    else next();
  }
}
