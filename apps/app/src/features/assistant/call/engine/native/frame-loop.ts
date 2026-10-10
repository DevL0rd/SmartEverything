const MAX_FAILURES = 5;

export interface FrameLoopPorts {
  readonly intervalMs: () => number;
  readonly step: () => Promise<void>;
  readonly failure: (error: unknown) => void;
}

export class FrameLoop {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private failures = 0;

  constructor(private readonly ports: FrameLoopPorts) {}

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.failures = 0;
    this.schedule(0);
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private schedule(delayMs: number): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      this.tick().catch((error: unknown) => {
        this.stop();
        this.ports.failure(error);
      });
    }, delayMs);
  }

  private async tick(): Promise<void> {
    const began = Date.now();
    try {
      await this.ports.step();
      this.failures = 0;
    } catch (error) {
      this.failures += 1;
      if (this.failures >= MAX_FAILURES) {
        this.stop();
        this.ports.failure(error);
        return;
      }
    }
    if (this.running) {
      this.schedule(Math.max(0, this.ports.intervalMs() - (Date.now() - began)));
    }
  }
}
