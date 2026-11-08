import type { DrivePlacement } from '@smarteverything/domain';
import type { PlacementReport } from './placement-state.js';

export interface MountTray {
  readonly status: string;
  readonly mounted: boolean;
}

type MountState = PlacementReport['state'];

const WORST_FIRST: readonly MountState[] = [
  'failed',
  'stopped',
  'offline',
  'blocked',
  'starting',
  'mounted',
];

export function mountedIds(placements: readonly DrivePlacement[]): ReadonlySet<string> {
  return new Set(
    placements
      .filter((placement) => placement.mode === 'mounted' && placement.enabled)
      .map((placement) => placement.id),
  );
}

function statusOf(state: MountState, reports: readonly PlacementReport[]): string {
  if (state === 'mounted') {
    return reports.some((report) => report.readOnly) ? 'Mounted · read only' : 'Mounted';
  }
  return `Mount ${state}`;
}

export class MountSummary {
  private ids: ReadonlySet<string> = new Set();
  private readonly reports = new Map<string, PlacementReport>();

  track(placements: readonly DrivePlacement[]): void {
    this.ids = mountedIds(placements);
    for (const id of [...this.reports.keys()]) {
      if (!this.ids.has(id)) this.reports.delete(id);
    }
  }

  report(report: PlacementReport): void {
    if (this.ids.has(report.placementId)) this.reports.set(report.placementId, report);
  }

  clear(): void {
    this.ids = new Set();
    this.reports.clear();
  }

  tray(): MountTray | null {
    const reports = [...this.reports.values()];
    const worst = WORST_FIRST.find((state) => reports.some((report) => report.state === state));
    if (worst === undefined) return null;
    return {
      status: statusOf(worst, reports),
      mounted: reports.some((report) => report.state === 'mounted'),
    };
  }
}
