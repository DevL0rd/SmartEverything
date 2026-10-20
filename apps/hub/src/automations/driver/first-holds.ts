import { appendTo } from '@smarteverything/domain';

export class FirstHolds {
  private readonly waiting = new Map<string, (() => void)[]>();

  wait(runId: string): Promise<void> {
    return new Promise((resolve) => {
      appendTo(this.waiting, runId, resolve);
    });
  }

  reached(runId: string): void {
    const held = this.waiting.get(runId);
    if (held === undefined) return;
    this.waiting.delete(runId);
    for (const resolve of held) resolve();
  }
}
