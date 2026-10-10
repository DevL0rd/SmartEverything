export type LogLinesListener = (lines: readonly string[]) => void;

export class LogLines {
  private readonly listeners = new Set<LogLinesListener>();
  private pending: string[] = [];

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

  listen(listener: LogLinesListener): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  private flush(): void {
    const lines = this.pending;
    this.pending = [];
    for (const listener of this.listeners) {
      listener(lines);
    }
  }
}
