export interface Stamped {
  readonly at: number;
}

export class Ring<T extends Stamped> {
  private items: T[] = [];

  constructor(private readonly max: number) {}

  push(item: T): void {
    this.items.push(item);
    if (this.items.length > this.max) {
      this.items.shift();
    }
  }

  between(from: number, to: number): readonly T[] {
    return this.items.filter((item) => item.at >= from && item.at <= to);
  }

  last(): T | null {
    return this.items[this.items.length - 1] ?? null;
  }
}
