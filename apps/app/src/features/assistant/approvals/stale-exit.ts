export const STALE_EXIT_MS = 10_000;

export class StaleExit {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly due = new Set<string>();
  private inside = false;

  constructor(
    private readonly leave: (id: string) => void,
    private readonly delay: number = STALE_EXIT_MS,
  ) {}

  sync(ids: readonly string[]): void {
    for (const [id, timer] of this.timers) {
      if (!ids.includes(id)) {
        clearTimeout(timer);
        this.timers.delete(id);
      }
    }
    for (const id of this.due) {
      if (!ids.includes(id)) this.due.delete(id);
    }
    for (const id of ids) {
      if (!this.timers.has(id) && !this.due.has(id)) {
        this.timers.set(
          id,
          setTimeout(() => {
            this.expire(id);
          }, this.delay),
        );
      }
    }
  }

  focus(inside: boolean): void {
    this.inside = inside;
    this.flush();
  }

  stop(): void {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    this.due.clear();
  }

  private expire(id: string): void {
    this.timers.delete(id);
    this.due.add(id);
    this.flush();
  }

  private flush(): void {
    if (this.inside) return;
    const ready = [...this.due];
    this.due.clear();
    ready.forEach(this.leave);
  }
}
