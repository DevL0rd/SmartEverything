import {
  DRIVE_HEALTH,
  type DriveBackupStatus,
  type DriveDataSpace,
  type DriveHealth,
  type DriveRoot,
  type DriveScrubState,
  type DriveWatcherState,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { StoreContext } from '../store/context';
import { inList } from '../store/sql';
import { driveAccess, type DriveActor } from './access';
import type { WatchStatus } from './watcher';

const UNAVAILABLE_STATES: readonly DriveRoot['state'][] = ['unresponsive', 'error'];

const PROBED_STATES: readonly DriveRoot['state'][] = ['ready', 'scanning'];

const COUNTS = z.object({ files: z.number(), hashed: z.number() });

const VERIFIED = z.object({ verified: z.number(), corrupt: z.number() });

export interface DriveHealthSources {
  readonly roots: () => DriveRoot[];
  readonly watcher: (rootId: string) => WatchStatus;
  readonly scrub: () => DriveScrubState;
  readonly backup: () => DriveBackupStatus;
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
  constructor(
    private readonly context: StoreContext,
    private readonly sources: DriveHealthSources,
  ) {}

  async read(actor: DriveActor): Promise<DriveHealth> {
    const roots = this.sources.roots().filter((root) => driveAccess(actor, root) !== 'none');
    const ids = roots.map((root) => root.id);
    const { files, hashed } = this.counts(ids);
    const { verified, corrupt } = this.verified(ids);
    return DRIVE_HEALTH.parse({
      hashedShare: share(hashed, files),
      verifiedShare: share(verified, hashed),
      corrupt,
      rootsTotal: roots.length,
      rootsUnavailable: roots.filter((root) => UNAVAILABLE_STATES.includes(root.state)).length,
      watcher: watcherState(roots, this.sources.watcher),
      space: await this.sources.space(),
      scrub: this.sources.scrub(),
      backup: this.sources.backup(),
    });
  }

  private counts(ids: readonly string[]): z.output<typeof COUNTS> {
    const filter = inList('root_id', 'roots', ids);
    return (
      this.context.sql.get(
        COUNTS,
        `select count(*) as files, count(sha256) as hashed from drive_items
          where kind <> 'folder' and ${filter.text}`,
        filter.parameters,
      ) ?? { files: 0, hashed: 0 }
    );
  }

  private verified(ids: readonly string[]): z.output<typeof VERIFIED> {
    const filter = inList('s.root_id', 'roots', ids);
    return (
      this.context.sql.get(
        VERIFIED,
        `select coalesce(sum(s.result = 'ok' and i.sha256 is not null), 0) as verified,
            coalesce(sum(s.result = 'corrupt'), 0) as corrupt
          from drive_scrub s join drive_items i on i.id = s.item_id where ${filter.text}`,
        filter.parameters,
      ) ?? { verified: 0, corrupt: 0 }
    );
  }
}
