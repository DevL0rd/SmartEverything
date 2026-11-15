import { randomUUID } from 'node:crypto';
import {
  ApiError,
  PARTNER_SHARE,
  type PARTNER_AUTO_SAVE,
  type PartnerSave,
  type PartnerSet,
  type PartnerShare,
} from '@smarteverything/domain';
import type { z } from 'zod';
import type { DriveActor } from '../../drive/access';
import type { PhotoPartnerShareRow } from '../../store/repositories/photo-partner-shares';
import type { Store } from '../../store/store';
import type { PartnerAutoSaver } from './auto-save';
import { partnerItemIds, presentCount, recordDelivered } from './partner-items';
import type { SavedAlbums } from './saved';

export type PartnersStore = Pick<
  Store,
  'context' | 'write' | 'driveAlbums' | 'photoGroups' | 'photoPartnerShares' | 'profiles'
>;

export function partnerOf(row: PhotoPartnerShareRow): PartnerShare {
  return PARTNER_SHARE.parse({
    id: row.id,
    sharerId: row.sharerId,
    recipientId: row.recipientId,
    scope: row.scope,
    groupIds: row.groupIds,
    fromDay: row.fromDay,
    state: row.state,
    autoSave: row.autoSave,
    createdAt: row.createdAt,
  });
}

export class PartnerSharing {
  constructor(
    private readonly store: PartnersStore,
    private readonly saved: SavedAlbums,
    private readonly auto: PartnerAutoSaver,
  ) {}

  set(actor: DriveActor, input: PartnerSet): PartnerShare {
    return this.store.write(() => {
      if (input.recipientId === actor.profileId) {
        throw new ApiError('invalid_request', 'A person does not share photos with themselves.');
      }
      if (!this.store.profiles.list().some((profile) => profile.id === input.recipientId)) {
        throw new ApiError('not_found', 'There is no such person to share with.');
      }
      this.requireOwnGroups(actor, input.groupIds);
      const open = this.store.photoPartnerShares.open(actor.profileId, input.recipientId);
      const row =
        open === undefined
          ? this.store.photoPartnerShares.insert({
              id: randomUUID(),
              sharerId: actor.profileId,
              recipientId: input.recipientId,
              scope: input.scope,
              groupIds: input.groupIds,
              fromDay: input.fromDay,
            })
          : this.store.photoPartnerShares.update(open.id, {
              scope: input.scope,
              groupIds: input.groupIds,
              fromDay: input.fromDay,
            });
      if (open !== undefined && row.autoSave) this.auto.reconcileShare(row);
      this.announce(row);
      return partnerOf(row);
    });
  }

  accept(actor: DriveActor, shareId: string): PartnerShare {
    return this.store.write(() => {
      const share = this.asRecipient(actor, shareId);
      if (share.state === 'stopped') {
        throw new ApiError('conflict', 'This partner share was stopped; ask for a new one.');
      }
      if (share.state === 'accepted') return partnerOf(share);
      const row = this.store.photoPartnerShares.update(share.id, { state: 'accepted' });
      this.announce(row);
      return partnerOf(row);
    });
  }

  stop(actor: DriveActor, shareId: string): PartnerShare {
    return this.store.write(() => {
      const share = this.participant(actor, shareId);
      if (share.state === 'stopped') return partnerOf(share);
      const row = this.store.photoPartnerShares.update(share.id, {
        state: 'stopped',
        autoSave: false,
      });
      this.announce(row);
      return partnerOf(row);
    });
  }

  save(actor: DriveActor, shareId: string, input: PartnerSave): { readonly saved: number } {
    return this.store.write(() => {
      const share = this.accepted(actor, shareId);
      const itemIds = partnerItemIds(this.store.context, share, input.itemIds);
      const albumId = this.saved.ensure(share);
      const fresh = itemIds.length - presentCount(this.store.context, albumId, itemIds);
      this.store.driveAlbums.addItems(albumId, itemIds, actor.profileId);
      recordDelivered(this.store.context, albumId, itemIds);
      return { saved: fresh };
    });
  }

  setAutoSave(
    actor: DriveActor,
    shareId: string,
    input: z.infer<typeof PARTNER_AUTO_SAVE>,
  ): PartnerShare {
    return this.store.write(() => {
      const share = this.accepted(actor, shareId);
      const row = this.store.photoPartnerShares.update(share.id, { autoSave: input.autoSave });
      if (row.autoSave) this.auto.reconcileShare(row);
      return partnerOf(row);
    });
  }

  private announce(row: PhotoPartnerShareRow): void {
    this.store.context.notice({
      type: 'photos_partner',
      shareId: row.id,
      sharerId: row.sharerId,
      recipientId: row.recipientId,
      state: row.state,
    });
  }

  private participant(actor: DriveActor, shareId: string): PhotoPartnerShareRow {
    const share = this.store.photoPartnerShares.find(shareId);
    if (
      share === undefined ||
      (share.sharerId !== actor.profileId && share.recipientId !== actor.profileId)
    ) {
      throw new ApiError('not_found', 'There is no such partner share for this person.');
    }
    return share;
  }

  private asRecipient(actor: DriveActor, shareId: string): PhotoPartnerShareRow {
    const share = this.participant(actor, shareId);
    if (share.recipientId !== actor.profileId) {
      throw new ApiError('forbidden', 'Only the person who is offered the photos can do this.');
    }
    return share;
  }

  private accepted(actor: DriveActor, shareId: string): PhotoPartnerShareRow {
    const share = this.asRecipient(actor, shareId);
    if (share.state !== 'accepted') {
      throw new ApiError('conflict', 'Accept the partner share first.');
    }
    return share;
  }

  private requireOwnGroups(actor: DriveActor, groupIds: readonly string[]): void {
    const own = new Set(
      this.store.photoGroups.forProfile(actor.profileId).map((group) => group.id),
    );
    const missing = groupIds.filter((id) => !own.has(id));
    if (missing.length > 0) {
      throw new ApiError(
        'not_found',
        `${String(missing.length)} of the chosen people are not among your people.`,
      );
    }
  }
}
