import {
  PARTNER_SCOPES,
  PARTNER_STATES,
  type PartnerScope,
  type PartnerState,
} from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../codec';
import { assignments, found, type StoreContext } from '../context';
import { flag } from '../sql';

const COLUMNS = `id, sharer_id, recipient_id, scope,
  (select json_group_array(group_id order by group_id)
    from photo_partner_groups where share_id = photo_partner_shares.id) as group_ids,
  from_day, state, auto_save, created_at`;

const PARTNER_COLUMNS = z.strictObject({
  id: z.string(),
  sharer_id: z.string(),
  recipient_id: z.string(),
  scope: z.enum(PARTNER_SCOPES),
  group_ids: z.array(z.string()),
  from_day: z.string(),
  state: z.enum(PARTNER_STATES),
  auto_save: z.boolean(),
  created_at: z.string(),
});

export interface PhotoPartnerShareRow {
  readonly id: string;
  readonly sharerId: string;
  readonly recipientId: string;
  readonly scope: PartnerScope;
  readonly groupIds: readonly string[];
  readonly fromDay: string;
  readonly state: PartnerState;
  readonly autoSave: boolean;
  readonly createdAt: string;
}

const STORED_PARTNER = storedRow(
  PARTNER_COLUMNS.transform((row): PhotoPartnerShareRow => ({
    id: row.id,
    sharerId: row.sharer_id,
    recipientId: row.recipient_id,
    scope: row.scope,
    groupIds: row.group_ids,
    fromDay: row.from_day,
    state: row.state,
    autoSave: row.auto_save,
    createdAt: row.created_at,
  })),
  { flags: ['auto_save'], json: ['group_ids'] },
);

export class PhotoPartnerScopeError extends Error {
  override readonly name = 'PhotoPartnerScopeError';

  constructor(readonly shareId: string) {
    super(
      `The partner share ${shareId} must share all photos with no people or chosen people with at least one.`,
    );
  }
}

export interface PhotoPartnerDraft {
  readonly id: string;
  readonly sharerId: string;
  readonly recipientId: string;
  readonly scope: PartnerScope;
  readonly groupIds: readonly string[];
  readonly fromDay: string;
}

export interface PhotoPartnerPatch {
  readonly scope?: PartnerScope;
  readonly groupIds?: readonly string[];
  readonly fromDay?: string;
  readonly state?: PartnerState;
  readonly autoSave?: boolean;
}

export class PhotoPartnerSharesRepository {
  constructor(private readonly context: StoreContext) {}

  find(id: string): PhotoPartnerShareRow | undefined {
    return this.context.sql.get(
      STORED_PARTNER,
      `select ${COLUMNS} from photo_partner_shares where id = $id`,
      { id },
    );
  }

  byId(id: string): PhotoPartnerShareRow {
    return found(this.find(id), 'photo partner share', id);
  }

  sharedBy(sharerId: string): PhotoPartnerShareRow[] {
    return this.context.sql.all(
      STORED_PARTNER,
      `select ${COLUMNS} from photo_partner_shares where sharer_id = $sharerId
        order by created_at, id`,
      { sharerId },
    );
  }

  sharedWith(recipientId: string): PhotoPartnerShareRow[] {
    return this.context.sql.all(
      STORED_PARTNER,
      `select ${COLUMNS} from photo_partner_shares where recipient_id = $recipientId
        order by created_at, id`,
      { recipientId },
    );
  }

  open(sharerId: string, recipientId: string): PhotoPartnerShareRow | undefined {
    return this.context.sql.get(
      STORED_PARTNER,
      `select ${COLUMNS} from photo_partner_shares
        where sharer_id = $sharerId and recipient_id = $recipientId and state <> 'stopped'`,
      { sharerId, recipientId },
    );
  }

  savedAlbumId(sharerId: string, recipientId: string): string | undefined {
    return this.context.sql.get(
      z.strictObject({ album_id: z.string() }).transform((row) => row.album_id),
      `select album_id from photo_partner_saved_albums
        where sharer_id = $sharerId and recipient_id = $recipientId`,
      { sharerId, recipientId },
    );
  }

  saveAlbum(sharerId: string, recipientId: string, albumId: string): void {
    this.context.sql.run(
      'remember the album of the partner photos',
      `insert into photo_partner_saved_albums (sharer_id, recipient_id, album_id)
        values ($sharerId, $recipientId, $albumId)
        on conflict (sharer_id, recipient_id) do update set album_id = excluded.album_id`,
      { sharerId, recipientId, albumId },
    );
  }

  insert(share: PhotoPartnerDraft): PhotoPartnerShareRow {
    return this.context.write(() => {
      this.context.sql.run(
        'offer the partner share',
        `insert into photo_partner_shares
          (id, sharer_id, recipient_id, scope, from_day, state, auto_save, created_at)
          values ($id, $sharerId, $recipientId, $scope, $fromDay, 'offered', 0, $now)`,
        {
          id: share.id,
          sharerId: share.sharerId,
          recipientId: share.recipientId,
          scope: share.scope,
          fromDay: share.fromDay,
          now: this.context.now(),
        },
      );
      this.setGroups(share.id, share.groupIds);
      return this.consistent(share.id);
    });
  }

  update(id: string, patch: PhotoPartnerPatch): PhotoPartnerShareRow {
    return this.context.write(() => {
      const changes = assignments({
        scope: patch.scope,
        from_day: patch.fromDay,
        state: patch.state,
        auto_save: patch.autoSave === undefined ? undefined : flag(patch.autoSave),
      });
      if (changes.text !== '') {
        this.context.sql.run(
          'update the partner share',
          `update photo_partner_shares set ${changes.text} where id = $id`,
          { ...changes.parameters, id },
        );
      }
      if (patch.groupIds !== undefined) {
        this.setGroups(id, patch.groupIds);
      }
      return this.consistent(id);
    });
  }

  private consistent(id: string): PhotoPartnerShareRow {
    const share = this.byId(id);
    if ((share.scope === 'people') !== share.groupIds.length > 0) {
      throw new PhotoPartnerScopeError(id);
    }
    return share;
  }

  private setGroups(id: string, groupIds: readonly string[]): void {
    this.context.sql.run(
      'clear the people of the partner share',
      'delete from photo_partner_groups where share_id = $id',
      { id },
    );
    for (const groupId of groupIds) {
      this.context.sql.run(
        'choose a person for the partner share',
        'insert into photo_partner_groups (share_id, group_id) values ($id, $groupId)',
        { id, groupId },
      );
    }
  }
}
