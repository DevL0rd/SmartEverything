import type { DrivePlacement } from '@smarteverything/domain';
import { messageOf, type Logger } from '@smarteverything/logging';
import type { FuseStatus } from './fuse-detect.js';
import type { HelperLine } from './helper-process.js';
import { MountSummary, mountedIds, type MountTray } from './mount-state.js';
import type { PlacementReport } from './placement-state.js';
import type { HelperPort, LinkPort, PlacementsController, PlacementsPorts } from './placements.js';

export type MountCommand =
  | { readonly kind: 'again' }
  | { readonly kind: 'clear-cache' }
  | { readonly kind: 'limit'; readonly mount: string; readonly bytes: number }
  | { readonly kind: 'pin' | 'unpin'; readonly mount: string; readonly path: string };

export interface HelperHandle extends HelperPort {
  readonly send: (line: HelperLine) => void;
  readonly close: () => Promise<void>;
}

export type MountPlacements = Pick<PlacementsController, 'start' | 'stop'>;

export interface MountControllerPorts {
  readonly fuse: () => Promise<FuseStatus>;
  readonly recover: (point: string) => Promise<unknown>;
  readonly known: () => readonly DrivePlacement[];
  readonly helper: HelperHandle;
  readonly link: LinkPort;
  readonly createPlacements: (ports: Pick<PlacementsPorts, 'helper' | 'link'>) => MountPlacements;
  readonly clearCache: () => Promise<void>;
  readonly tray: (state: MountTray | null) => void;
  readonly log: Logger;
}

export class MountNotRunningError extends Error {
  override readonly name = 'MountNotRunningError';

  constructor(kind: string) {
    super(`The ${kind} request needs the mount to be running`);
  }
}

export class MountController {
  private readonly summary = new MountSummary();
  private readonly listeners = new Set<(raw: string) => void>();
  private placements: MountPlacements | null = null;
  private fuse: FuseStatus = { available: true };
  private shown = JSON.stringify(null);
  private queue: Promise<void> = Promise.resolve();

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
    } else if (command.kind === 'clear-cache') {
      await this.down();
      await this.ports.clearCache();
      await this.up();
    } else {
      this.forward(command);
    }
  }

  private forward(
    command: Exclude<MountCommand, { readonly kind: 'again' | 'clear-cache' }>,
  ): void {
    if (this.placements === null) throw new MountNotRunningError(command.kind);
    if (command.kind === 'limit') {
      this.ports.helper.send({ op: 'limit', mount: command.mount, bytes: command.bytes });
    } else {
      this.ports.helper.send({ op: command.kind, mount: command.mount, path: command.path });
    }
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
    if (this.fuse.available) await this.recoverStale(known);
    const placements = this.ports.createPlacements({
      helper: this.gatedHelper(),
      link: this.trackedLink(),
    });
    this.placements = placements;
    placements.start();
    this.publish();
  }

  private async down(): Promise<void> {
    const { placements } = this;
    this.placements = null;
    placements?.stop();
    await this.ports.helper.close();
    this.summary.clear();
    this.publish();
  }

  private async recoverStale(known: readonly DrivePlacement[]): Promise<void> {
    const ids = mountedIds(known);
    for (const placement of known.filter((candidate) => ids.has(candidate.id))) {
      try {
        await this.ports.recover(placement.localPath);
      } catch (cause) {
        this.ports.log.warn('drive_mount.stale_recovery_failed', {
          placement_id: placement.id,
          error: messageOf(cause),
        });
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
    const raw = JSON.stringify({ type: 'status', mount, state: 'failed', reason });
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
