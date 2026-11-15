import { PHOTO_GROUP_KINDS, type PhotoGroupKind } from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../codec';
import { assignments, found, type StoreContext } from '../context';
import { flag, inList } from '../sql';

export const PHOTO_GROUP_SOURCES = ['auto', 'confirmed', 'rejected'] as const;

export type PhotoGroupSource = (typeof PHOTO_GROUP_SOURCES)[number];

const COLUMNS =
  'id, profile_id, kind, species, name, linked_profile_id, cover_face_id, hidden, created_at, updated_at';

const GROUP_COLUMNS = z.strictObject({
  id: z.string(),
  profile_id: z.string(),
  kind: z.enum(PHOTO_GROUP_KINDS),
  species: z.string().nullable(),
  name: z.string().nullable(),
  linked_profile_id: z.string().nullable(),
  cover_face_id: z.string().nullable(),
  hidden: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export interface PhotoGroupRow {
  readonly id: string;
  readonly profileId: string;
  readonly kind: PhotoGroupKind;
  readonly species: string | null;
  readonly name: string | null;
  readonly linkedProfileId: string | null;
  readonly coverFaceId: string | null;
  readonly hidden: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

const STORED_GROUP = storedRow(
  GROUP_COLUMNS.transform((row): PhotoGroupRow => ({
    id: row.id,
    profileId: row.profile_id,
    kind: row.kind,
    species: row.species,
    name: row.name,
    linkedProfileId: row.linked_profile_id,
    coverFaceId: row.cover_face_id,
    hidden: row.hidden,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })),
  { flags: ['hidden'] },
);

const MEMBERSHIP = z.strictObject({
  group_id: z.string(),
  face_id: z.string(),
  profile_id: z.string(),
  source: z.enum(PHOTO_GROUP_SOURCES),
});

export interface PhotoGroupFace {
  readonly groupId: string;
  readonly faceId: string;
  readonly profileId: string;
  readonly source: PhotoGroupSource;
}

function membershipOf(row: z.output<typeof MEMBERSHIP>): PhotoGroupFace {
  return {
    groupId: row.group_id,
    faceId: row.face_id,
    profileId: row.profile_id,
    source: row.source,
  };
}

export interface PhotoGroupDraft {
  readonly id: string;
  readonly profileId: string;
  readonly kind: PhotoGroupKind;
  readonly species: string | null;
  readonly name: string | null;
  readonly coverFaceId: string | null;
}

export interface PhotoGroupPatch {
  readonly name?: string | null;
  readonly linkedProfileId?: string | null;
  readonly hidden?: boolean;
  readonly coverFaceId?: string | null;
}

export class PhotoGroupMergeError extends Error {
  override readonly name = 'PhotoGroupMergeError';

  constructor(
    readonly targetId: string,
    readonly sourceId: string,
  ) {
    super(
      `The photo group ${sourceId} cannot merge into ${targetId}: not the same person and kind.`,
    );
  }
}

export class PhotoGroupsRepository {
  constructor(private readonly context: StoreContext) {}

  find(id: string): PhotoGroupRow | undefined {
    return this.context.sql.get(
      STORED_GROUP,
      `select ${COLUMNS} from photo_groups where id = $id`,
      { id },
    );
  }

  byId(id: string): PhotoGroupRow {
    return found(this.find(id), 'photo group', id);
  }

  forProfile(profileId: string, kind?: PhotoGroupKind): PhotoGroupRow[] {
    return this.context.sql.all(
      STORED_GROUP,
      `select ${COLUMNS} from photo_groups
        where profile_id = $profileId ${kind === undefined ? '' : 'and kind = $kind'}
        order by created_at, id`,
      kind === undefined ? { profileId } : { profileId, kind },
    );
  }

  insert(group: PhotoGroupDraft): PhotoGroupRow {
    return this.context.write(() => {
      this.context.sql.run(
        'create the photo group',
        `insert into photo_groups (${COLUMNS})
          values ($id, $profileId, $kind, $species, $name, null, $coverFaceId, 0, $now, $now)`,
        {
          id: group.id,
          profileId: group.profileId,
          kind: group.kind,
          species: group.species,
          name: group.name,
          coverFaceId: group.coverFaceId,
          now: this.context.now(),
        },
      );
      return this.byId(group.id);
    });
  }

  update(id: string, patch: PhotoGroupPatch): PhotoGroupRow {
    return this.context.write(() => {
      const changes = assignments({
        name: patch.name,
        linked_profile_id: patch.linkedProfileId,
        hidden: patch.hidden === undefined ? undefined : flag(patch.hidden),
        cover_face_id: patch.coverFaceId,
        updated_at: this.context.now(),
      });
      this.context.sql.run(
        'update the photo group',
        `update photo_groups set ${changes.text} where id = $id`,
        { ...changes.parameters, id },
      );
      return this.byId(id);
    });
  }

  remove(id: string): void {
    this.context.write(() => {
      this.context.sql.run('remove the photo group', 'delete from photo_groups where id = $id', {
        id,
      });
    });
  }

  removeForProfile(profileId: string, kind: PhotoGroupKind): number {
    return this.context.write(() =>
      this.context.sql.run(
        'remove the photo groups of a person',
        'delete from photo_groups where profile_id = $profileId and kind = $kind',
        { profileId, kind },
      ),
    );
  }

  assign(
    groupId: string,
    faceIds: readonly string[],
    source: Exclude<PhotoGroupSource, 'rejected'>,
  ): void {
    this.context.write(() => {
      const group = this.byId(groupId);
      for (const faceId of faceIds) {
        this.context.sql.run(
          'take the face out of its other groups',
          `delete from photo_group_faces
            where profile_id = $profileId and face_id = $faceId and group_id <> $groupId
              and source <> 'rejected'`,
          { profileId: group.profileId, faceId, groupId },
        );
        this.context.sql.run(
          'put the face in the photo group',
          `insert into photo_group_faces (group_id, face_id, profile_id, source)
            values ($groupId, $faceId, $profileId, $source)
            on conflict (group_id, face_id) do update set source = excluded.source`,
          { groupId, faceId, profileId: group.profileId, source },
        );
      }
    });
  }

  reject(groupId: string, faceIds: readonly string[]): void {
    this.context.write(() => {
      const group = this.byId(groupId);
      for (const faceId of faceIds) {
        this.context.sql.run(
          'record that the face is not in the photo group',
          `insert into photo_group_faces (group_id, face_id, profile_id, source)
            values ($groupId, $faceId, $profileId, 'rejected')
            on conflict (group_id, face_id) do update set source = 'rejected'`,
          { groupId, faceId, profileId: group.profileId },
        );
      }
    });
  }

  merge(targetId: string, sourceIds: readonly string[]): PhotoGroupRow {
    return this.context.write(() => {
      const target = this.byId(targetId);
      for (const sourceId of sourceIds) {
        const source = this.byId(sourceId);
        if (source.profileId !== target.profileId || source.kind !== target.kind) {
          throw new PhotoGroupMergeError(targetId, sourceId);
        }
        this.context.sql.run(
          'clear the rejections the merged faces carry in the target',
          `delete from photo_group_faces
            where group_id = $targetId and source = 'rejected' and face_id in
              (select face_id from photo_group_faces
                where group_id = $sourceId and source <> 'rejected')`,
          { targetId, sourceId },
        );
        this.context.sql.run(
          'move the faces of the merged group',
          `update photo_group_faces set group_id = $targetId
            where group_id = $sourceId and source <> 'rejected'`,
          { targetId, sourceId },
        );
        this.context.sql.run(
          'remove the merged group',
          'delete from photo_groups where id = $sourceId',
          { sourceId },
        );
      }
      return this.update(targetId, {});
    });
  }

  faceIds(groupId: string): string[] {
    return this.context.sql
      .all(
        z.strictObject({ face_id: z.string() }),
        `select face_id from photo_group_faces
          where group_id = $groupId and source <> 'rejected' order by face_id`,
        { groupId },
      )
      .map((row) => row.face_id);
  }

  groupOfFace(profileId: string, faceId: string): PhotoGroupRow | undefined {
    return this.context.sql.get(
      STORED_GROUP,
      `select ${COLUMNS} from photo_groups g
        where g.profile_id = $profileId and g.id =
          (select group_id from photo_group_faces
            where profile_id = $profileId and face_id = $faceId and source <> 'rejected')`,
      { profileId, faceId },
    );
  }

  membershipsOf(profileId: string, faceIds: readonly string[]): PhotoGroupFace[] {
    const filter = inList('face_id', 'ids', faceIds);
    return this.context.sql
      .all(
        MEMBERSHIP,
        `select group_id, face_id, profile_id, source from photo_group_faces
          where profile_id = $profileId and ${filter.text} order by group_id, face_id`,
        { profileId, ...filter.parameters },
      )
      .map(membershipOf);
  }

  rejectedGroups(profileId: string, faceId: string): string[] {
    return this.context.sql
      .all(
        z.strictObject({ group_id: z.string() }),
        `select group_id from photo_group_faces
          where profile_id = $profileId and face_id = $faceId and source = 'rejected'
          order by group_id`,
        { profileId, faceId },
      )
      .map((row) => row.group_id);
  }

  unassignedFaceIds(profileId: string, itemIds: readonly string[]): string[] {
    const filter = inList('f.item_id', 'ids', itemIds);
    return this.context.sql
      .all(
        z.strictObject({ id: z.string() }),
        `select f.id from photo_faces f
          where ${filter.text}
            and not exists (select 1 from photo_group_faces gf
              where gf.profile_id = $profileId and gf.face_id = f.id and gf.source <> 'rejected')
          order by f.id`,
        { profileId, ...filter.parameters },
      )
      .map((row) => row.id);
  }
}
