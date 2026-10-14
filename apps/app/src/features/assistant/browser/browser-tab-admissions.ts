import type { BrowserSelection } from './browser-selection';
import type { BrowserTabId } from './browser-tab-state';
export class BrowserTabAdmissions {
  private readonly generations = new Map<BrowserTabId, number>();
  private readonly timers = new Map<BrowserTabId, ReturnType<typeof setTimeout>>();
  generation(id: BrowserTabId): number | undefined {
    return this.generations.get(id);
  }
  cancel(id: BrowserTabId): number {
    const timer = this.timers.get(id);
    if (timer !== undefined) clearTimeout(timer);
    this.timers.delete(id);
    const generation = (this.generations.get(id) ?? 0) + 1;
    this.generations.set(id, generation);
    return generation;
  }
  close(id: BrowserTabId): void {
    this.cancel(id);
    this.generations.delete(id);
  }
  expire(id: BrowserTabId, selection: BrowserSelection, unavailable: () => void): void {
    if (selection.kind === 'public' || selection.lease.expires_at === null) return;
    this.timers.set(
      id,
      setTimeout(unavailable, Math.max(0, Date.parse(selection.lease.expires_at) - Date.now())),
    );
  }
}
