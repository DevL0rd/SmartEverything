import {
  syncingWords,
  type DesktopDriveSyncing,
  type DrivePlacement,
} from '@smarteverything/domain';
import { bytesPerSecondOf } from './sync-activity.js';
import type { HelperUploads, PlacementReport } from './placement-state.js';

export interface MountTrayPoint {
  readonly placementId: string;
  readonly point: string;
}

export interface MountTray {
  readonly status: string;
  readonly mounted: boolean;
  readonly points: readonly MountTrayPoint[];
  readonly syncing: DesktopDriveSyncing | null;
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

function troubleOf(state: MountState, reports: readonly PlacementReport[]): string {
  const reason = reports.find((report) => report.state === state && report.reason !== null)?.reason;
  return reason === undefined || reason === null ? `Mount ${state}` : `Mount ${state}: ${reason}`;
}

function statusOf(
  state: MountState,
  reports: readonly PlacementReport[],
  syncing: DesktopDriveSyncing | null,
): string {
  if (state !== 'mounted') return troubleOf(state, reports);
  const parts = ['Mounted'];
  if (reports.some((report) => report.readOnly)) parts.push('read only');
  if (syncing !== null) parts.push(syncingWords(syncing));
  return parts.join(' · ');
}

interface BurstBase {
  readonly files: number;
  readonly bytes: number;
  readonly at: number;
}

class UploadBurst {
  private base: BurstBase | null = null;
  private now: HelperUploads | null = null;
  private seenAt = 0;

  constructor(private readonly clock: () => number) {}

  see(uploads: HelperUploads): void {
    this.now = uploads;
    this.seenAt = this.clock();
    const restarted =
      this.base !== null &&
      (uploads.sentFiles < this.base.files || uploads.sentBytes < this.base.bytes);
    if (uploads.files === 0) this.base = null;
    else if (this.base === null || restarted)
      this.base = { files: uploads.sentFiles, bytes: uploads.sentBytes, at: this.seenAt };
  }

  clear(): void {
    this.base = null;
    this.now = null;
  }

  syncing(): DesktopDriveSyncing | null {
    const { base, now } = this;
    if (base === null || now === null) return null;
    const sentBytes = now.sentBytes - base.bytes;
    return {
      files: now.files,
      bytes: now.bytes,
      sentFiles: now.sentFiles - base.files,
      sentBytes,
      bytesPerSecond: bytesPerSecondOf(sentBytes, this.seenAt - base.at),
    };
  }
}

export class MountSummary {
  private ids: ReadonlySet<string> = new Set();
  private readonly reports = new Map<string, PlacementReport>();
  private readonly open = new Map<string, number>();
  private readonly burst: UploadBurst;

  constructor(clock: () => number) {
    this.burst = new UploadBurst(clock);
  }

  track(placements: readonly DrivePlacement[]): void {
    this.ids = mountedIds(placements);
    for (const id of [...this.reports.keys()]) {
      if (!this.ids.has(id)) this.reports.delete(id);
    }
    for (const id of [...this.open.keys()]) {
      if (!this.ids.has(id)) this.open.delete(id);
    }
  }

  counters(placementId: string, openFiles: number): void {
    if (!this.ids.has(placementId)) return;
    this.open.set(placementId, openFiles);
  }

  uploads(uploads: HelperUploads): void {
    this.burst.see(uploads);
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
    this.open.clear();
    this.burst.clear();
  }

  tray(): MountTray | null {
    const reports = [...this.reports.values()];
    const worst = WORST_FIRST.find((state) => reports.some((report) => report.state === state));
    if (worst === undefined) return null;
    const syncing = this.burst.syncing();
    return {
      status: statusOf(worst, reports, syncing),
      mounted: reports.some((report) => report.state === 'mounted'),
      syncing,
      points: reports.flatMap((report): MountTrayPoint[] =>
        report.mountPoint === null
          ? []
          : [{ placementId: report.placementId, point: report.mountPoint }],
      ),
    };
  }
}
