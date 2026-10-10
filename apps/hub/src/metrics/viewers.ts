export type ViewListener = (watched: boolean) => void;

export function deviceTarget(deviceId: string): string {
  return `device:${deviceId}`;
}

export class Viewers {
  private readonly leases = new Map<string, Set<string>>();
  private readonly listeners = new Map<string, Set<ViewListener>>();

  watched(target: string): boolean {
    return (this.leases.get(target)?.size ?? 0) > 0;
  }

  watch(target: string, listener: ViewListener): () => void {
    const listeners = this.listeners.get(target) ?? new Set<ViewListener>();
    listeners.add(listener);
    this.listeners.set(target, listeners);
    return (): void => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.listeners.delete(target);
      }
    };
  }

  lease(target: string, holder: string): () => void {
    const holders = this.leases.get(target) ?? new Set<string>();
    const first = holders.size === 0;
    holders.add(holder);
    this.leases.set(target, holders);
    if (first) {
      this.notify(target, true);
    }
    return (): void => {
      if (!holders.delete(holder) || holders.size > 0) {
        return;
      }
      this.leases.delete(target);
      this.notify(target, false);
    };
  }

  private notify(target: string, watched: boolean): void {
    for (const listener of this.listeners.get(target) ?? []) {
      listener(watched);
    }
  }
}
