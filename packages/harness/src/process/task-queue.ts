import { Logger } from '@smarteverything/logging';
export class ProcessTaskQueue {
  private readonly pending = new Map<string, (() => Promise<void>)[]>();
  private readonly running = new Map<string, Promise<void>>();
  private readonly log = new Logger('hub.harness');
  constructor(private readonly projected: (id: string) => Promise<void>) {}
  keep(id: string, task: () => Promise<void>): void {
    const tasks = this.pending.get(id) ?? [];
    tasks.push(task);
    this.pending.set(id, tasks);
    this.flush(id).catch((cause: unknown): void => {
      this.log.error('projection.failed', cause, { session_id: id });
    });
  }
  ids(): string[] {
    return [...new Set([...this.pending.keys(), ...this.running.keys()])];
  }
  flush(id: string): Promise<void> {
    const existing = this.running.get(id);
    if (existing !== undefined) return existing;
    const result = Promise.resolve()
      .then(() => this.project(id))
      .finally(() => {
        this.running.delete(id);
      });
    this.running.set(id, result);
    return result;
  }
  private async project(id: string): Promise<void> {
    const tasks = this.pending.get(id);
    if (tasks === undefined) return;
    while (tasks.length > 0) {
      const task = tasks[0];
      if (task === undefined) throw new Error('Retained native projection task is absent.');
      await task();
      tasks.shift();
      await this.projected(id);
    }
    this.pending.delete(id);
  }
}
