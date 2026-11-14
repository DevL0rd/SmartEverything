import type { DrivePlacement } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import type { PlacementReport } from '../../src/drive-mount/placement-state.js';
import { FIXTURE_STATUS, mountedPlacement } from './placement-fixture.js';
import { PlacementRelay, type PlacementFeed } from '../../src/drive-mount/relay-link.js';

function placement(id: string): DrivePlacement {
  return mountedPlacement({ id });
}

function report(id: string): PlacementReport {
  return { ...FIXTURE_STATUS, placementId: id };
}

class Feed implements PlacementFeed {
  mountsDemanded = false;
  readonly reports: PlacementReport[] = [];
  private readonly placements = new Set<(placements: readonly DrivePlacement[]) => void>();
  private readonly demands = new Set<(demanded: boolean) => void>();

  onPlacements = (listener: (placements: readonly DrivePlacement[]) => void): (() => void) => {
    this.placements.add(listener);
    return (): void => {
      this.placements.delete(listener);
    };
  };

  onMountsDemand = (listener: (demanded: boolean) => void): (() => void) => {
    this.demands.add(listener);
    return (): void => {
      this.demands.delete(listener);
    };
  };

  report = (next: PlacementReport): void => {
    this.reports.push(next);
  };

  push(placements: readonly DrivePlacement[]): void {
    for (const listener of this.placements) listener(placements);
  }

  demand(demanded: boolean): void {
    this.mountsDemanded = demanded;
    for (const listener of this.demands) listener(demanded);
  }
}

describe('PlacementRelay', () => {
  it('survives a reconnect: keeps the latest placements, replays reports and follows the new feed', () => {
    const relay = new PlacementRelay();
    const seen = vi.fn();
    relay.onPlacements(seen);
    const first = new Feed();
    relay.attach(first);
    first.push([placement('a'), placement('b')]);
    relay.report(report('a'));
    relay.report(report('b'));
    expect(first.reports.map((entry) => entry.placementId)).toEqual(['a', 'b']);
    first.push([placement('a')]);

    relay.detach();
    first.push([placement('c')]);
    expect(seen).toHaveBeenCalledTimes(2);

    const second = new Feed();
    relay.attach(second);
    expect(second.reports.map((entry) => entry.placementId)).toEqual(['a']);
    const late = vi.fn();
    relay.onPlacements(late);
    expect(late).toHaveBeenCalledWith([placement('a')]);
    second.push([placement('z')]);
    expect(late).toHaveBeenLastCalledWith([placement('z')]);
  });

  it('forwards the demand of the current feed only and drops it on detach', () => {
    const relay = new PlacementRelay();
    const demand = vi.fn();
    relay.onMountsDemand(demand);
    const first = new Feed();
    relay.attach(first);
    first.demand(true);
    expect(relay.mountsDemanded()).toBe(true);
    expect(demand).toHaveBeenLastCalledWith(true);
    const second = new Feed();
    second.mountsDemanded = true;
    relay.attach(second);
    first.demand(false);
    expect(relay.mountsDemanded()).toBe(true);
    relay.detach();
    expect(relay.mountsDemanded()).toBe(false);
    expect(demand).toHaveBeenLastCalledWith(false);
  });

  it('keeps reports until the feed is back but sends nothing while detached', () => {
    const relay = new PlacementRelay();
    relay.report(report('a'));
    const feed = new Feed();
    relay.attach(feed);
    expect(feed.reports).toHaveLength(1);
  });
});
