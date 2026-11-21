import {
  DRIVE_HEALTH,
  type DriveBackupStatus,
  type DriveDataSpace,
  type DriveHealth,
  type DriveRoot,
  type DriveScrubState,
  type DriveWatcherState,
} from '@smarteverything/domain';
import type { DriveActor } from './access';
import type { DriveHealthFigures } from './units/health';
import type { WatchStatus } from './watcher';

const UNAVAILABLE_STATES: readonly DriveRoot['state'][] = ['unresponsive', 'error'];

const PROBED_STATES: readonly DriveRoot['state'][] = ['ready', 'scanning'];

export interface DriveHealthSources {
  readonly figures: (actor: DriveActor) => Promise<DriveHealthFigures>;
  readonly watcher: (rootId: string) => WatchStatus;
  readonly scrub: () => Promise<DriveScrubState>;
  readonly backup: () => Promise<DriveBackupStatus>;
  readonly space: () => Promise<DriveDataSpace>;
}

function share(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}

export function watcherState(
  roots: readonly DriveRoot[],
  watcher: DriveHealthSources['watcher'],
): DriveWatcherState {
  const watched = roots.filter((root) => PROBED_STATES.includes(root.state));
  if (watched.some((root) => !watcher(root.id).watching)) {
    return 'unavailable';
  }
  return watched.some((root) => root.state === 'scanning') ? 'reconciling' : 'watching';
}

export class DriveHealthReader {
  constructor(private readonly sources: DriveHealthSources) {}

  async read(actor: DriveActor): Promise<DriveHealth> {
    const { roots, files, hashed, verified, corrupt } = await this.sources.figures(actor);
    return DRIVE_HEALTH.parse({
      hashedShare: share(hashed, files),
      verifiedShare: share(verified, hashed),
      corrupt,
      rootsTotal: roots.length,
      rootsUnavailable: roots.filter((root) => UNAVAILABLE_STATES.includes(root.state)).length,
      watcher: watcherState(roots, this.sources.watcher),
      space: await this.sources.space(),
      scrub: await this.sources.scrub(),
      backup: await this.sources.backup(),
    });
  }
}
