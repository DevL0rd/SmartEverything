import type { LogRecord } from '@smarteverything/logging';

export type LogLinesListener = (lines: readonly string[], records: readonly LogRecord[]) => void;

export class LogLines {
  private readonly listeners = new Set<LogLinesListener>();
  private pending: string[] = [];

  private records: LogRecord[] = [];

  write(line: string): void {
    if (this.listeners.size === 0) {
      return;
    }
    this.pending.push(line);
    if (this.pending.length === 1) {
      queueMicrotask(() => {
        this.flush();
      });
    }
  }

  record(entry: LogRecord): void {
    if (this.listeners.size === 0) {
      return;
    }
    this.records.push(entry);
    if (this.records.length === 1) {
      queueMicrotask(() => {
        this.flush();
      });
    }
  }

  listen(listener: LogLinesListener): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  private flush(): void {
    const lines = this.pending;
    const records = this.records;
    this.pending = [];
    this.records = [];
    for (const listener of this.listeners) {
      listener(lines, records);
    }
  }
}
