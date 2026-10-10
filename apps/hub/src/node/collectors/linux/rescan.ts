const RESCAN_MS = 60_000;

interface Scanned<T> {
  readonly value: T;
  readonly at: number;
}

export class Rescan<T> {
  private scanned: Scanned<T> | null = null;

  constructor(private readonly scan: () => T) {}

  current(at: number): T {
    if (this.scanned === null || at - this.scanned.at >= RESCAN_MS) {
      this.scanned = { value: this.scan(), at };
    }
    return this.scanned.value;
  }

  invalidate(): void {
    this.scanned = null;
  }
}
