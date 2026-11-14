import type { DrivePlacement } from '@smarteverything/domain';
import type { PlacementReport } from './placement-state.js';
import type { LinkPort } from './placements.js';

export interface PlacementFeed {
  readonly mountsDemanded: boolean;
  readonly onPlacements: (listener: (placements: readonly DrivePlacement[]) => void) => () => void;
  readonly onMountsDemand: (listener: (demanded: boolean) => void) => () => void;
  readonly report: (report: PlacementReport) => void;
}

export class PlacementRelay implements LinkPort {
  private readonly placementListeners = new Set<(placements: readonly DrivePlacement[]) => void>();
  private readonly demandListeners = new Set<(demanded: boolean) => void>();
  private readonly lastReports = new Map<string, PlacementReport>();
  private feed: PlacementFeed | null = null;
  private stopFeed: (() => void) | null = null;
  private latest: readonly DrivePlacement[] | null = null;
  private demanded = false;

  attach(feed: PlacementFeed): void {
    this.detach();
    this.feed = feed;
    this.stopFeed = this.listenTo(feed);
    this.setDemanded(feed.mountsDemanded);
    for (const report of this.lastReports.values()) feed.report(report);
  }

  detach(): void {
    this.stopFeed?.();
    this.stopFeed = null;
    this.feed = null;
    this.setDemanded(false);
  }

  onPlacements = (listener: (placements: readonly DrivePlacement[]) => void): (() => void) => {
    this.placementListeners.add(listener);
    if (this.latest !== null) listener(this.latest);
    return () => {
      this.placementListeners.delete(listener);
    };
  };

  onMountsDemand = (listener: (demanded: boolean) => void): (() => void) => {
    this.demandListeners.add(listener);
    return () => {
      this.demandListeners.delete(listener);
    };
  };

  mountsDemanded = (): boolean => this.demanded;

  report = (report: PlacementReport): void => {
    this.lastReports.set(report.placementId, report);
    this.feed?.report(report);
  };

  private listenTo(feed: PlacementFeed): () => void {
    const stopPlacements = feed.onPlacements((placements) => {
      this.latest = placements;
      const known = new Set(placements.map((placement) => placement.id));
      for (const id of [...this.lastReports.keys()]) {
        if (!known.has(id)) this.lastReports.delete(id);
      }
      for (const listener of this.placementListeners) listener(placements);
    });
    const stopDemand = feed.onMountsDemand((demanded) => {
      if (this.feed === feed) this.setDemanded(demanded);
    });
    return () => {
      stopPlacements();
      stopDemand();
    };
  }

  private setDemanded(demanded: boolean): void {
    if (demanded === this.demanded) return;
    this.demanded = demanded;
    for (const listener of this.demandListeners) listener(demanded);
  }
}
