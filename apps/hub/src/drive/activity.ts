export class DriveActivity {
  private running = 0;
  private started = 0;
  private readonly waiting: (() => void)[] = [];

  async around<T>(work: () => Promise<T>): Promise<T> {
    this.running += 1;
    this.started += 1;
    try {
      return await work();
    } finally {
      this.running -= 1;
      if (this.running === 0) for (const resolve of this.waiting.splice(0)) resolve();
    }
  }

  get generation(): number {
    return this.started;
  }

  quietSince(generation: number): boolean {
    return this.running === 0 && this.started === generation;
  }

  quiet(): Promise<void> {
    if (this.running === 0) return Promise.resolve();
    return new Promise((resolve) => {
      this.waiting.push(resolve);
    });
  }
}
