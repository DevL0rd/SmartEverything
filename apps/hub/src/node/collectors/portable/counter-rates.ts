interface Counter {
  readonly bytes: number;
  readonly at: number;
}

export class CounterRates {
  private readonly last = new Map<string, Counter>();

  rate(key: string, bytes: number, at: number): number {
    const before = this.last.get(key);
    this.last.set(key, { bytes, at });
    if (before === undefined || at <= before.at || bytes < before.bytes) return 0;
    return ((bytes - before.bytes) / (at - before.at)) * 1000;
  }

  forgetExcept(keys: ReadonlySet<string>): void {
    for (const key of this.last.keys()) {
      if (!keys.has(key)) this.last.delete(key);
    }
  }
}
