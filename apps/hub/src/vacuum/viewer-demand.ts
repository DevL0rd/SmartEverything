import type { ProcessWindow } from '@smarteverything/domain';
import type { ViewDemand, Viewers } from '../metrics/viewers';

export const VACUUM_VIEW_TOPIC = 'live';

export type ViewerSource = Pick<Viewers<ProcessWindow>, 'follow' | 'demand'>;

export interface ViewerDemandPorts {
  readonly viewers: ViewerSource;
  readonly target: (deviceId: string) => string;
  readonly changed: (deviceId: string, watched: boolean) => void;
}

export class VacuumViewerDemand {
  private readonly follows = new Map<string, () => void>();
  private readonly watching = new Set<string>();

  constructor(private readonly ports: ViewerDemandPorts) {}

  watched(deviceId: string): boolean {
    return this.watching.has(deviceId);
  }

  attach(deviceId: string): void {
    this.follows.get(deviceId)?.();
    const target = this.ports.target(deviceId);
    this.follows.set(
      deviceId,
      this.ports.viewers.follow(target, (demand) => {
        this.apply(deviceId, demand);
      }),
    );
    this.apply(deviceId, this.ports.viewers.demand(target));
  }

  detach(deviceId: string): void {
    this.follows.get(deviceId)?.();
    this.follows.delete(deviceId);
    if (this.watching.delete(deviceId)) this.ports.changed(deviceId, false);
  }

  private apply(deviceId: string, demand: ViewDemand<ProcessWindow>): void {
    const watched = demand.topics.has(VACUUM_VIEW_TOPIC);
    if (watched === this.watching.has(deviceId)) return;
    if (watched) this.watching.add(deviceId);
    else this.watching.delete(deviceId);
    this.ports.changed(deviceId, watched);
  }
}
