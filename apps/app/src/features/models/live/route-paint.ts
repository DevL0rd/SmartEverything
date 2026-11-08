export class RoutePaint {
  private key: string | null = null;
  private token = 0;

  get route(): string | null {
    return this.key;
  }

  get generation(): number {
    return this.token;
  }

  select(route: string | null): boolean {
    if (route === this.key) return false;
    this.key = route;
    this.invalidate();
    return true;
  }

  invalidate(): void {
    this.token += 1;
  }

  accepts(generation: number): boolean {
    return generation === this.token;
  }
}

function sameIds(previous: readonly string[], next: readonly string[]): boolean {
  return previous.length === next.length && previous.every((id, index) => id === next[index]);
}

export class PaintAcknowledgement {
  private token = 0;
  private eligible: readonly string[] = [];
  private drawn: readonly string[] | null = null;

  get generation(): number {
    return this.token;
  }

  sync(generation: number, eligible: readonly string[]): void {
    if (generation !== this.token || !sameIds(this.eligible, eligible)) {
      this.drawn = null;
    }
    this.token = generation;
    this.eligible = eligible;
  }

  acknowledge(drawn: readonly string[]): boolean {
    if (this.drawn !== null && sameIds(this.drawn, drawn)) return false;
    this.drawn = drawn;
    return true;
  }
}
