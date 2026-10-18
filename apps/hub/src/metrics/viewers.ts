import { appendTo } from '@smarteverything/domain';

export type ViewListener = (watched: boolean) => void;

export interface ViewLease<Detail> {
  readonly target: string;
  readonly topic: string;
  readonly detail?: Detail;
}

export interface ViewDemand<Detail> {
  readonly topics: ReadonlySet<string>;
  readonly details: ReadonlyMap<string, readonly Detail[]>;
}

export type DemandListener<Detail> = (demand: ViewDemand<Detail>) => void;

export function deviceTarget(deviceId: string): string {
  return `device:${deviceId}`;
}

function signatureOf<Detail>(demand: ViewDemand<Detail>): string {
  return JSON.stringify([[...demand.topics].sort(), [...demand.details].sort()]);
}

export class Viewers<Detail = never> {
  private readonly holders = new Map<string, readonly ViewLease<Detail>[]>();
  private readonly watchers = new Map<string, Set<ViewListener>>();
  private readonly followers = new Map<string, Set<DemandListener<Detail>>>();
  private readonly signatures = new Map<string, string>();

  watched(target: string): boolean {
    return this.demand(target).topics.size > 0;
  }

  demand(target: string): ViewDemand<Detail> {
    const topics = new Set<string>();
    const details = new Map<string, Detail[]>();
    for (const leases of this.holders.values()) {
      for (const lease of leases) {
        if (lease.target !== target) continue;
        topics.add(lease.topic);
        if (lease.detail === undefined) continue;
        appendTo(details, lease.topic, lease.detail);
      }
    }
    return { topics, details };
  }

  watch(target: string, listener: ViewListener): () => void {
    return this.listen(this.watchers, target, listener);
  }

  follow(target: string, listener: DemandListener<Detail>): () => void {
    return this.listen(this.followers, target, listener);
  }

  hold(holder: string, leases: readonly ViewLease<Detail>[]): void {
    const before = this.holders.get(holder) ?? [];
    const watchedBefore = new Map(
      [...before, ...leases].map((lease) => [lease.target, this.watched(lease.target)]),
    );
    if (leases.length === 0) {
      this.holders.delete(holder);
    } else {
      this.holders.set(holder, leases);
    }
    for (const [target, was] of watchedBefore) {
      this.changed(target, was);
    }
  }

  release(holder: string): void {
    this.hold(holder, []);
  }

  private changed(target: string, was: boolean): void {
    const demand = this.demand(target);
    const signature = demand.topics.size === 0 ? '' : signatureOf(demand);
    if (signature !== (this.signatures.get(target) ?? '')) {
      if (signature === '') this.signatures.delete(target);
      else this.signatures.set(target, signature);
      for (const listener of this.followers.get(target) ?? []) listener(demand);
    }
    const now = demand.topics.size > 0;
    if (now === was) return;
    for (const listener of this.watchers.get(target) ?? []) listener(now);
  }

  private listen<L>(registry: Map<string, Set<L>>, target: string, listener: L): () => void {
    const listeners = registry.get(target) ?? new Set<L>();
    listeners.add(listener);
    registry.set(target, listeners);
    return (): void => {
      listeners.delete(listener);
      if (listeners.size === 0) registry.delete(target);
    };
  }
}
