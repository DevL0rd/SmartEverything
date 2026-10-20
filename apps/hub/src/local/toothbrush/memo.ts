export class Memo<T> {
  private readonly values = new Map<string, T>();

  clear(): void {
    this.values.clear();
  }

  get(key: string, build: () => T): T {
    const known = this.values.get(key);
    if (known !== undefined) {
      return known;
    }
    const made = build();
    this.values.set(key, made);
    return made;
  }
}
