import type {
  DriveGrant,
  DriveGrantSet,
  DriveSharedByMeEntry,
  DriveSharedWithMeEntry,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { Store } from '../store/store';
import type { DriveActor } from './access';

const log = new Logger('hub.drive');

export const GRANT_PAGE_SIZE = 50;

export interface GrantPage<T> {
  readonly items: readonly T[];
  readonly next: string | null;
}

export interface GrantsEnv {
  readonly store: Pick<Store, 'host'>;
}

export class DriveGrants {
  constructor(private readonly env: GrantsEnv) {}

  list(actor: DriveActor, itemId: string): Promise<DriveGrant[]> {
    return this.env.store.host.read('driveGrantsOfItem', { actor, itemId });
  }

  async set(actor: DriveActor, input: DriveGrantSet): Promise<DriveGrant> {
    const grant = await this.env.store.host.write('driveGrantSet', { actor, grant: input });
    log.info('drive_grant.set', {
      grantId: grant.id,
      itemId: grant.itemId,
      role: grant.role,
      by: actor.profileId,
    });
    return grant;
  }

  async remove(actor: DriveActor, grantId: string): Promise<void> {
    await this.env.store.host.write('driveGrantRemove', { actor, grantId });
    log.info('drive_grant.removed', { grantId, by: actor.profileId });
  }

  sharedWithMe(
    actor: DriveActor,
    cursor: string | undefined,
  ): Promise<GrantPage<DriveSharedWithMeEntry>> {
    return this.env.store.host.read('driveSharedWithMe', { actor, cursor });
  }

  sharedByMe(
    actor: DriveActor,
    cursor: string | undefined,
  ): Promise<GrantPage<DriveSharedByMeEntry>> {
    return this.env.store.host.read('driveSharedByMe', { actor, cursor });
  }
}
