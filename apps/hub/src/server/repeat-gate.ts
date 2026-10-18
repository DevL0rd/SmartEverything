const MAXIMUM_KEYS = 200;

interface Entry {
  at: number;
  suppressed: number;
}

export class RepeatGate {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly intervalMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  pass(key: string): number | null {
    const at = this.now();
    const entry = this.entries.get(key);
    if (entry !== undefined && at - entry.at < this.intervalMs) {
      entry.suppressed += 1;
      return null;
    }
    if (entry === undefined && this.entries.size >= MAXIMUM_KEYS) this.entries.clear();
    const suppressed = entry?.suppressed ?? 0;
    this.entries.set(key, { at, suppressed: 0 });
    return suppressed;
  }
}
