import type { DrivePlacement } from '@smarteverything/domain';
import type { PlacementReport } from './placement-state.js';

export interface MountTrayPoint {
  readonly placementId: string;
  readonly point: string;
}

export interface MountTray {
  readonly status: string;
  readonly mounted: boolean;
  readonly points: readonly MountTrayPoint[];
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

function pendingWord(count: number): string {
  return `${String(count)} ${count === 1 ? 'upload' : 'uploads'} pending`;
}

function statusOf(state: MountState, reports: readonly PlacementReport[], pending: number): string {
  if (state !== 'mounted') return `Mount ${state}`;
  const parts = ['Mounted'];
  if (reports.some((report) => report.readOnly)) parts.push('read only');
  if (pending > 0) parts.push(pendingWord(pending));
  return parts.join(' · ');
}

export class MountSummary {
  private ids: ReadonlySet<string> = new Set();
  private readonly reports = new Map<string, PlacementReport>();
  private readonly pending = new Map<string, number>();
  private readonly open = new Map<string, number>();

  track(placements: readonly DrivePlacement[]): void {
    this.ids = mountedIds(placements);
    for (const id of [...this.reports.keys()]) {
      if (!this.ids.has(id)) this.reports.delete(id);
    }
    for (const id of [...this.pending.keys()]) {
      if (!this.ids.has(id)) this.pending.delete(id);
    }
    for (const id of [...this.open.keys()]) {
      if (!this.ids.has(id)) this.open.delete(id);
    }
  }

  counters(placementId: string, pendingUploads: number, openFiles: number): void {
    if (!this.ids.has(placementId)) return;
    this.pending.set(placementId, pendingUploads);
    this.open.set(placementId, openFiles);
  }

  openFiles(): number {
    return [...this.open.values()].reduce((total, count) => total + count, 0);
  }

  report(report: PlacementReport): void {
    if (this.ids.has(report.placementId)) this.reports.set(report.placementId, report);
  }

  clear(): void {
    this.ids = new Set();
    this.reports.clear();
    this.pending.clear();
    this.open.clear();
  }

  tray(): MountTray | null {
    const reports = [...this.reports.values()];
    const worst = WORST_FIRST.find((state) => reports.some((report) => report.state === state));
    if (worst === undefined) return null;
    return {
      status: statusOf(
        worst,
        reports,
        [...this.pending.values()].reduce((total, count) => total + count, 0),
      ),
      mounted: reports.some((report) => report.state === 'mounted'),
      points: reports.flatMap((report): MountTrayPoint[] =>
        report.mountPoint === null
          ? []
          : [{ placementId: report.placementId, point: report.mountPoint }],
      ),
    };
  }
}
