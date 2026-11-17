import type { DrivePlacement, HubFrame, NodeFrame } from '@smarteverything/domain';
import { Listeners } from '../listeners';

type PlacementsFrame = Extract<HubFrame, { readonly type: 'placements' }>;

type PlacementStateFrame = Extract<NodeFrame, { readonly type: 'placement_state' }>;

export type PlacementReport = Omit<PlacementStateFrame, 'type'>;

export class PlacementLink {
  private latest: readonly DrivePlacement[] | null = null;
  private demanded = false;
  private greeted = false;
  private readonly held = new Map<string, PlacementReport>();
  private readonly placementListeners = new Listeners<readonly DrivePlacement[]>();
  private readonly demandListeners = new Listeners<boolean>();

  constructor(private readonly send: (frame: NodeFrame) => void) {}

  get mountsDemanded(): boolean {
    return this.demanded;
  }

  handle(frame: HubFrame): frame is PlacementsFrame {
    if (frame.type === 'demand') {
      this.setDemanded(frame.demand.topics.drive_mounts !== undefined);
    }
    if (frame.type !== 'placements') {
      return false;
    }
    this.latest = frame.placements;
    const known = new Set(frame.placements.map((placement) => placement.id));
    for (const id of [...this.held.keys()]) {
      if (!known.has(id)) this.held.delete(id);
    }
    this.placementListeners.emit(frame.placements);
    return true;
  }

  onPlacements(listener: (placements: readonly DrivePlacement[]) => void): () => void {
    const stop = this.placementListeners.listen(listener);
    if (this.latest !== null) {
      listener(this.latest);
    }
    return stop;
  }

  onMountsDemand(listener: (demanded: boolean) => void): () => void {
    return this.demandListeners.listen(listener);
  }

  report(report: PlacementReport): void {
    this.held.set(report.placementId, report);
    if (this.greeted) this.send({ type: 'placement_state', ...report });
  }

  helloSent(): void {
    this.greeted = true;
    for (const report of this.held.values()) this.send({ type: 'placement_state', ...report });
  }

  stop(): void {
    this.greeted = false;
    this.latest = null;
    this.setDemanded(false);
  }

  private setDemanded(demanded: boolean): void {
    if (demanded === this.demanded) {
      return;
    }
    this.demanded = demanded;
    this.demandListeners.emit(demanded);
  }
}
