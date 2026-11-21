import type {
  DesktopDriveTuning,
  DesktopDriveTuningState,
  DrivePlacement,
} from '@smarteverything/domain';
import { messageOf, type Logger } from '@smarteverything/logging';
import type { FuseStatus } from './fuse-detect.js';
import type { HelperLine } from './helper-process.js';
import { TuningReport } from './helper-tuning-report.js';
import { MountSummary, type MountTray } from './mount-state.js';
import { parseHelperLine, type PlacementReport } from './placement-state.js';
import type { HelperPort, LinkPort, PlacementsController, PlacementsPorts } from './placements.js';

export type MountCommand =
  | { readonly kind: 'again' }
  | { readonly kind: 'remount' }
  | { readonly kind: 'clear-cache' }
  | { readonly kind: 'pin' | 'unpin'; readonly mount: string; readonly path: string };

export interface HelperHandle extends HelperPort {
  readonly send: (line: HelperLine) => void;
  readonly close: () => Promise<void>;
  readonly onCrash: (listener: (reason: string) => void) => () => void;
  readonly restart: () => void;
}

export type MountPlacements = Pick<PlacementsController, 'start' | 'stop'>;

export interface MountControllerPorts {
  readonly fuse: () => Promise<FuseStatus>;
  readonly recover: (point: string) => Promise<unknown>;
  readonly stalePoints: () => Promise<readonly string[]>;
  readonly known: () => readonly DrivePlacement[];
  readonly helper: HelperHandle;
  readonly link: LinkPort;
  readonly createPlacements: (ports: Pick<PlacementsPorts, 'helper' | 'link'>) => MountPlacements;
  readonly clearCache: () => Promise<void>;
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly tray: (state: MountTray | null) => void;
  readonly tuningChanged: () => void;
  readonly log: Logger;
}

const RESTART_FIRST_MS = 1000;
const RESTART_LONGEST_MS = 30_000;

export class MountNotRunningError extends Error {
  override readonly name = 'MountNotRunningError';

  constructor(kind: string) {
    super(`The ${kind} request needs the mount to be running`);
  }
}

export class MountHasOpenFilesError extends Error {
  override readonly name = 'MountHasOpenFilesError';

  constructor(count: number) {
    super(
      `The mount cannot restart while ${String(count)} ${count === 1 ? 'file is' : 'files are'} open`,
    );
  }
}

export class MountController {
  private readonly summary = new MountSummary(Date.now);
  private readonly tuningReport = new TuningReport();
  private readonly listeners = new Set<(raw: string) => void>();
  private placements: MountPlacements | null = null;
  private fuse: FuseStatus = { available: true };
  private shown = JSON.stringify(null);
  private queue: Promise<void> = Promise.resolve();
  private generation = 0;
  private crashes = 0;
  private watching: readonly (() => void)[] = [];

  constructor(private readonly ports: MountControllerPorts) {}

  start(): Promise<void> {
    return this.enqueue(() => this.up());
  }

  stop(): Promise<void> {
    return this.enqueue(() => this.down());
  }

  run(command: MountCommand): Promise<void> {
    return this.enqueue(() => this.apply(command));
  }

  tuning(saved: DesktopDriveTuning): DesktopDriveTuningState {
    return this.tuningReport.state(saved);
  }

  private enqueue(work: () => Promise<void>): Promise<void> {
    const next = this.queue.then(work);
    this.queue = next.catch((cause: unknown) => {
      this.ports.log.error('drive_mount.controller_failed', cause);
    });
    return next;
  }

  private async apply(command: MountCommand): Promise<void> {
    if (command.kind === 'again') {
      await this.down();
      await this.up();
    } else if (command.kind === 'remount') {
      const open = this.summary.openFiles();
      if (open > 0) throw new MountHasOpenFilesError(open);
      await this.down();
      await this.up();
    } else if (command.kind === 'clear-cache') {
      await this.down();
      await this.ports.clearCache();
      await this.up();
    } else {
      this.forward(command);
    }
  }

  private forward(
    command: Exclude<MountCommand, { readonly kind: 'again' | 'remount' | 'clear-cache' }>,
  ): void {
    if (this.placements === null) throw new MountNotRunningError(command.kind);
    this.ports.helper.send({ op: command.kind, mount: command.mount, path: command.path });
  }

  private async up(): Promise<void> {
    this.fuse = await this.ports.fuse();
    if (!this.fuse.available) {
      this.ports.log.warn('drive_mount.fuse_unavailable', {
        missing: this.fuse.missing.join(','),
        command: this.fuse.command,
      });
    }
    const known = this.ports.known();
    this.summary.track(known);
    if (this.fuse.available) await this.recoverStale();
    const placements = this.ports.createPlacements({
      helper: this.gatedHelper(),
      link: this.trackedLink(),
    });
    this.placements = placements;
    this.generation += 1;
    this.crashes = 0;
    this.watching = [
      this.ports.helper.onLine((raw) => {
        this.observe(raw);
      }),
      this.ports.helper.onCrash(() => {
        this.crashed(this.generation);
      }),
    ];
    placements.start();
    this.publish();
  }

  private async down(): Promise<void> {
    const { placements } = this;
    this.placements = null;
    this.generation += 1;
    for (const stop of this.watching) stop();
    this.watching = [];
    placements?.stop();
    await this.ports.helper.close();
    this.summary.clear();
    this.tuningReport.clear();
    this.ports.tuningChanged();
    this.publish();
  }

  private observe(raw: string): void {
    let line: ReturnType<typeof parseHelperLine>;
    try {
      line = parseHelperLine(raw);
    } catch (cause) {
      this.ports.log.warn('drive_mount.helper_line_rejected', { error: messageOf(cause) });
      return;
    }
    switch (line.type) {
      case 'status':
        if (line.state === 'mounted') this.crashes = 0;
        else {
          this.tuningReport.drop(line.mount);
          this.ports.tuningChanged();
        }
        return;
      case 'error':
        this.ports.log.warn('drive_mount.helper_error', {
          mount: line.mount ?? null,
          reason: line.reason,
        });
        return;
      case 'limits':
        this.tuningReport.limit(line);
        this.ports.tuningChanged();
        return;
      case 'applied':
        this.tuningReport.apply(line);
        this.ports.tuningChanged();
        return;
      case 'counters':
        this.summary.counters(line.mount, line.openFiles);
        this.publish();
        return;
      case 'uploads':
        this.summary.uploads(line);
        this.publish();
    }
  }

  private crashed(generation: number): void {
    this.tuningReport.clear();
    this.ports.tuningChanged();
    const delay = Math.min(RESTART_FIRST_MS * 2 ** this.crashes, RESTART_LONGEST_MS);
    this.crashes += 1;
    this.ports.log.warn('drive_mount.helper_restart_scheduled', { delay_ms: delay });
    this.ports
      .sleep(delay)
      .then(() => this.enqueue(() => this.restart(generation)))
      .catch((cause: unknown) => {
        this.ports.log.error('drive_mount.helper_restart_failed', cause);
      });
  }

  private async restart(generation: number): Promise<void> {
    if (generation !== this.generation || this.placements === null) return;
    await this.recoverStale();
    if (generation !== this.generation) return;
    this.ports.helper.restart();
  }

  private async recoverStale(): Promise<void> {
    for (const point of await this.ports.stalePoints()) {
      try {
        await this.ports.recover(point);
      } catch (cause) {
        this.ports.log.warn('drive_mount.stale_recovery_failed', { error: messageOf(cause) });
      }
    }
  }

  private gatedHelper(): HelperPort {
    const gated: HelperPort = {
      send: (line) => {
        if (line.op === 'mount' && !this.fuse.available) {
          this.refuse(line.mount, this.fuse.reason);
          return;
        }
        this.ports.helper.send(line);
      },
      onLine: (listener) => {
        this.listeners.add(listener);
        const stop = this.ports.helper.onLine(listener);
        return () => {
          this.listeners.delete(listener);
          stop();
        };
      },
    };
    return gated;
  }

  private refuse(mount: string, reason: string): void {
    const raw = JSON.stringify({ type: 'status', mount, state: 'failed', reason, readOnly: false });
    for (const listener of this.listeners) listener(raw);
  }

  private trackedLink(): LinkPort {
    const { link } = this.ports;
    const tracked: LinkPort = {
      ...link,
      onPlacements: (listener) =>
        link.onPlacements((placements) => {
          this.summary.track(placements);
          listener(placements);
        }),
      report: (report: PlacementReport) => {
        link.report(report);
        this.summary.report(report);
        this.publish();
      },
    };
    return tracked;
  }

  private publish(): void {
    const state = this.summary.tray();
    const key = JSON.stringify(state);
    if (key === this.shown) return;
    this.shown = key;
    this.ports.tray(state);
  }
}
