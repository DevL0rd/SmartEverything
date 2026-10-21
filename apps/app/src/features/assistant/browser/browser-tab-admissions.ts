import type { BrowserTabId } from './browser-tab-state';
export class BrowserTabAdmissions {
  private readonly generations = new Map<BrowserTabId, number>();
  generation(id: BrowserTabId): number | undefined {
    return this.generations.get(id);
  }
  cancel(id: BrowserTabId): number {
    const generation = (this.generations.get(id) ?? 0) + 1;
    this.generations.set(id, generation);
    return generation;
  }
  close(id: BrowserTabId): void {
    this.generations.delete(id);
  }
}
