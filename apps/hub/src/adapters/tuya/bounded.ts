export class LoadOnce<Value> {
  private readonly entries = new Map<string, Promise<Value>>();

  get(key: string, load: () => Promise<Value>): Promise<Value> {
    const known = this.entries.get(key);
    if (known !== undefined) {
      return known;
    }
    const loading = load();
    this.entries.set(key, loading);
    // eslint-disable-next-line local/no-swallowed-errors -- the caller awaits the same load and receives its failure
    loading.catch(() => {
      this.entries.delete(key);
    });
    return loading;
  }
}
