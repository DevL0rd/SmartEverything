export class Listeners<T> {
  private readonly all = new Set<(value: T) => void>();

  emit(value: T): void {
    for (const listener of this.all) {
      listener(value);
    }
  }

  listen(listener: (value: T) => void): () => void {
    this.all.add(listener);
    return (): void => {
      this.all.delete(listener);
    };
  }
}
