export class ViewerFocus {
  private tick = 0;
  private readonly seen = new Map<string, number>();

  touch(viewerId: string): void {
    this.tick += 1;
    this.seen.set(viewerId, this.tick);
  }

  latest<T>(items: readonly T[], viewerOf: (item: T) => string): T | undefined {
    let best: T | undefined;
    for (const item of items)
      if (best === undefined || this.rank(viewerOf(item)) > this.rank(viewerOf(best))) best = item;
    return best;
  }

  private rank(viewerId: string): number {
    return this.seen.get(viewerId) ?? 0;
  }
}
