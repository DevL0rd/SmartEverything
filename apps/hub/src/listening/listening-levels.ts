export interface ListeningLevelsOptions {
  readonly connected: () => ReadonlySet<string>;
  readonly send: (clientId: string, sourceKey: string, dbfs: number) => void;
}

export class ListeningLevels {
  private readonly watching = new Map<string, string>();
  private readonly listeners = new Set<(sourceKey: string, watched: boolean) => void>();

  constructor(private readonly options: ListeningLevelsOptions) {}

  watch(clientId: string, sourceKey: string | null): void {
    const before = this.watching.get(clientId);
    if (before === sourceKey) return;
    if (sourceKey === null) this.watching.delete(clientId);
    else this.watching.set(clientId, sourceKey);
    if (before !== undefined) this.settle(before);
    if (sourceKey !== null) this.settle(sourceKey);
  }

  watched(sourceKey: string): boolean {
    return [...this.watching.values()].includes(sourceKey);
  }

  onWatched(listener: (sourceKey: string, watched: boolean) => void): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  report(sourceKey: string, dbfs: number): void {
    const online = this.options.connected();
    [...this.watching.entries()]
      .filter(([, key]) => key === sourceKey)
      .forEach(([clientId]) => {
        if (online.has(clientId)) this.options.send(clientId, sourceKey, dbfs);
        else this.watch(clientId, null);
      });
  }

  private settle(sourceKey: string): void {
    const watched = this.watched(sourceKey);
    this.listeners.forEach((listener) => {
      listener(sourceKey, watched);
    });
  }
}
