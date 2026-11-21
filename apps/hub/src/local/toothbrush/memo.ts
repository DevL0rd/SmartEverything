export class Memo<T> {
  private readonly values = new Map<string, T>();
  private generation = 0;

  clear(): void {
    this.values.clear();
    this.generation += 1;
  }

  async get(key: string, build: () => Promise<T>): Promise<T> {
    const known = this.values.get(key);
    if (known !== undefined) {
      return known;
    }
    const started = this.generation;
    const made = await build();
    if (started === this.generation) {
      this.values.set(key, made);
    }
    return made;
  }
}
