import { background, type LogPayload } from '@smarteverything/logging';

export class PendingWork {
  private readonly running = new Set<Promise<unknown>>();

  constructor(private readonly event: string) {}

  run(work: Promise<unknown>, fields: LogPayload = {}): void {
    const tracked: Promise<unknown> = work.finally(() => {
      this.running.delete(tracked);
    });
    this.running.add(tracked);
    background(tracked, this.event, fields);
  }

  async settled(): Promise<void> {
    while (this.running.size > 0) await Promise.allSettled([...this.running]);
  }
}
