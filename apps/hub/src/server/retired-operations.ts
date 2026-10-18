export class RetiredOperations {
  private readonly ids = new Set<string>();
  constructor(private readonly limit: number) {}
  add(id: string): void {
    this.ids.add(id);
    if (this.ids.size <= this.limit) return;
    const oldest = this.ids.values().next().value;
    if (oldest !== undefined) this.ids.delete(oldest);
  }
  has(id: string): boolean {
    return this.ids.has(id);
  }
}
