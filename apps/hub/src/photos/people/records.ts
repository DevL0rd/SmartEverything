import {
  ApiError,
  PHOTO_ITEM_FACES,
  type PhotoGroup,
  type PhotoGroupKind,
  type PhotoGroupMerge,
  type PhotoGroupUpdate,
  type PhotoItemFaces,
  type PhotoMergeDismiss,
  type PhotoMergeSuggestion,
  type PhotoPeople,
  type PhotoRemoveFaces,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { DriveActor } from '../../drive/access';
import type { StoreContext } from '../../store/context';
import type { PhotoFacesRepository } from '../../store/repositories/photo-faces';
import {
  PhotoGroupMergeError,
  type PhotoGroupRow,
  type PhotoGroupsRepository,
} from '../../store/repositories/photo-groups';
import { PeopleRows, VISIBLE_ITEM, type VisibleFace } from './rows';
import { GroupViews } from './views';

const PRESENT = z.strictObject({ found: z.int() });

const PROFILE = z.strictObject({ id: z.string() });

const DISMISSED = z.strictObject({ group_a: z.string(), group_b: z.string() });

export interface GroupingConsent {
  readonly faceGrouping: (profileId: string) => boolean;
  readonly smartSearch: (profileId: string) => boolean;
}

export type RegroupSource =
  | { readonly state: 'refused' }
  | { readonly state: 'settled' }
  | {
      readonly state: 'unassigned';
      readonly faces: VisibleFace[];
      readonly rejected: Map<string, Set<string>>;
    };

export interface GroupPlacement {
  readonly groupId: string;
  readonly faceIds: readonly string[];
  readonly species: string | null;
}

export interface PeopleTables {
  readonly context: StoreContext;
  readonly groups: PhotoGroupsRepository;
  readonly faces: PhotoFacesRepository;
  readonly consent: GroupingConsent;
}

export class PeopleRecords {
  private readonly rows: PeopleRows;
  readonly views: GroupViews;

  constructor(private readonly tables: PeopleTables) {
    this.rows = new PeopleRows(tables.context);
    this.views = new GroupViews(tables.context, tables.groups);
  }

  profiles(): string[] {
    return this.tables.context.sql
      .all(PROFILE, 'select id from profiles order by id')
      .map((row) => row.id);
  }

  regroupSource(profileId: string, kind: PhotoGroupKind): RegroupSource {
    const { consent } = this.tables;
    const allowed =
      kind === 'person' ? consent.faceGrouping(profileId) : consent.smartSearch(profileId);
    if (!allowed) return { state: 'refused' };
    if (!this.rows.hasUnassigned(profileId, kind)) return { state: 'settled' };
    return {
      state: 'unassigned',
      faces: this.rows.visibleFaces(profileId, kind),
      rejected: this.rows.rejections(profileId),
    };
  }

  place(profileId: string, kind: PhotoGroupKind, placements: readonly GroupPlacement[]): void {
    const { context, groups } = this.tables;
    context.write(() => {
      for (const { groupId, faceIds, species } of placements) {
        const first = faceIds[0];
        if (first === undefined) continue;
        if (groups.find(groupId) === undefined)
          groups.insert({
            id: groupId,
            profileId,
            kind,
            species,
            name: null,
            coverFaceId: first,
          });
        groups.assign(groupId, faceIds, 'auto');
      }
      this.tidy(profileId, kind);
    });
  }

  tidy(profileId: string, kind: PhotoGroupKind): void {
    const { context } = this.tables;
    context.write(() => {
      context.sql.run(
        'remove the unnamed photo groups that lost every face',
        `delete from photo_groups
          where profile_id = $profileId and kind = $kind
            and name is null and linked_profile_id is null
            and not exists (select 1 from photo_group_faces gf
              where gf.group_id = photo_groups.id and gf.source <> 'rejected')`,
        { profileId, kind },
      );
      context.sql.run(
        'give the photo groups without a cover their best face',
        `update photo_groups set cover_face_id = (
            select gf.face_id from photo_group_faces gf join photo_faces f on f.id = gf.face_id
            where gf.group_id = photo_groups.id and gf.source <> 'rejected'
            order by f.quality desc, f.id limit 1)
          where profile_id = $profileId and kind = $kind and cover_face_id is null`,
        { profileId, kind },
      );
    });
  }

  people(
    actor: DriveActor,
    kind: PhotoGroupKind | undefined,
    suggestions: readonly PhotoMergeSuggestion[],
  ): PhotoPeople {
    const groups = this.views.list(actor.profileId, kind);
    const known = new Set(groups.map((group) => group.id));
    return {
      groups,
      mergeSuggestions: this.undismissed(
        actor.profileId,
        suggestions.filter((suggestion) => suggestion.groupIds.every((id) => known.has(id))),
      ),
    };
  }

  group(actor: DriveActor, groupId: string): PhotoGroup {
    return this.views.one(actor.profileId, groupId);
  }

  groupsMatching(actor: DriveActor, groupIds: readonly string[]): PhotoGroup[] {
    return this.views.list(actor.profileId, undefined, groupIds);
  }

  dismissMerge(actor: DriveActor, dismiss: PhotoMergeDismiss): void {
    const [first, second] = dismiss.groupIds;
    const one = this.owned(actor, first);
    const other = this.owned(actor, second);
    if (one.kind !== other.kind || one.species !== other.species)
      throw new ApiError('invalid_request', 'Only the same kind of person or pet is suggested.');
    const [low, high] = first < second ? [first, second] : [second, first];
    const { context } = this.tables;
    context.write(() => {
      context.sql.run(
        'remember that two groups are not the same person',
        `insert or ignore into photo_merge_dismissals (profile_id, group_a, group_b, dismissed_at)
          values ($profileId, $low, $high, $at)`,
        { profileId: actor.profileId, low, high, at: context.now() },
      );
    });
  }

  update(actor: DriveActor, groupId: string, patch: PhotoGroupUpdate): PhotoGroup {
    const row = this.owned(actor, groupId);
    if (patch.linkedProfileId !== undefined && patch.linkedProfileId !== null) {
      if (row.kind !== 'person')
        throw new ApiError('invalid_request', 'Only a person can be linked to a household member.');
      this.requireProfile(patch.linkedProfileId);
    }
    const { context, groups } = this.tables;
    context.write(() => {
      groups.update(groupId, {
        ...(patch.name === undefined ? {} : { name: patch.name }),
        ...(patch.linkedProfileId === undefined ? {} : { linkedProfileId: patch.linkedProfileId }),
        ...(patch.hidden === undefined ? {} : { hidden: patch.hidden }),
      });
      if (patch.name !== undefined || patch.linkedProfileId !== undefined) this.confirm(groupId);
    });
    return this.views.one(actor.profileId, groupId);
  }

  merge(actor: DriveActor, merge: PhotoGroupMerge): PhotoGroup {
    const target = this.owned(actor, merge.targetId);
    for (const sourceId of merge.sourceIds) {
      const source = this.owned(actor, sourceId);
      if (source.kind !== target.kind || source.species !== target.species)
        throw new ApiError('invalid_request', 'Only the same kind of person or pet can be merged.');
    }
    const { context, groups } = this.tables;
    context.write(() => {
      try {
        groups.merge(merge.targetId, merge.sourceIds);
      } catch (cause) {
        if (cause instanceof PhotoGroupMergeError)
          throw new ApiError('invalid_request', cause.message);
        throw cause;
      }
      this.confirm(merge.targetId);
    });
    return this.views.one(actor.profileId, merge.targetId);
  }

  rejectFaces(actor: DriveActor, groupId: string, body: PhotoRemoveFaces): PhotoGroupKind {
    const row = this.owned(actor, groupId);
    const { groups } = this.tables;
    const members = new Set(groups.faceIds(groupId));
    const stray = body.faceIds.find((faceId) => !members.has(faceId));
    if (stray !== undefined)
      throw new ApiError('invalid_request', 'That face is not in this person or pet.');
    groups.reject(groupId, body.faceIds);
    return row.kind;
  }

  itemFaces(actor: DriveActor, itemId: string): PhotoItemFaces {
    const { context, faces, groups } = this.tables;
    const visible = context.sql.get(
      PRESENT,
      `select 1 as found from drive_items i join drive_roots r on r.id = i.root_id where i.id = $itemId and ${VISIBLE_ITEM}`,
      { itemId, profile: actor.profileId },
    );
    if (visible === undefined) throw new ApiError('not_found', 'That photo is not in your Photos.');
    const found = faces.forItem(itemId);
    const memberships = new Map(
      groups
        .membershipsOf(
          actor.profileId,
          found.map((face) => face.id),
        )
        .filter((membership) => membership.source !== 'rejected')
        .map((membership) => [membership.faceId, membership.groupId]),
    );
    const named = new Map<string, string | null>();
    return PHOTO_ITEM_FACES.parse({
      itemId,
      faces: found.map((face) => {
        const groupId = memberships.get(face.id) ?? null;
        if (groupId !== null && !named.has(groupId))
          named.set(groupId, groups.find(groupId)?.name ?? null);
        return {
          id: face.id,
          kind: face.kind,
          species: face.species,
          box: face.box,
          groupId,
          groupName: groupId === null ? null : (named.get(groupId) ?? null),
        };
      }),
    });
  }

  private owned(actor: DriveActor, groupId: string): PhotoGroupRow {
    const row = this.tables.groups.find(groupId);
    if (row?.profileId !== actor.profileId)
      throw new ApiError('not_found', 'There is no such person or pet.');
    return row;
  }

  private requireProfile(profileId: string): void {
    const found = this.tables.context.sql.get(
      PRESENT,
      'select 1 as found from profiles where id = $profileId',
      { profileId },
    );
    if (found === undefined) throw new ApiError('not_found', 'There is no such household member.');
  }

  private confirm(groupId: string): void {
    const { groups } = this.tables;
    groups.assign(groupId, groups.faceIds(groupId), 'confirmed');
  }

  private undismissed(
    profileId: string,
    suggestions: readonly PhotoMergeSuggestion[],
  ): readonly PhotoMergeSuggestion[] {
    const dismissed = new Set(
      this.tables.context.sql
        .all(
          DISMISSED,
          'select group_a, group_b from photo_merge_dismissals where profile_id = $profileId',
          { profileId },
        )
        .map((row) => `${row.group_a}|${row.group_b}`),
    );
    return suggestions.filter((suggestion) => {
      const [first, second] = suggestion.groupIds;
      const [low, high] = first < second ? [first, second] : [second, first];
      return !dismissed.has(`${low}|${high}`);
    });
  }
}
