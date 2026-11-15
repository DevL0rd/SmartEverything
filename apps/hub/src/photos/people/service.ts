import {
  ApiError,
  PHOTO_ITEM_FACES,
  type PhotoGroup,
  type PhotoGroupKind,
  type PhotoGroupMerge,
  type PhotoGroupUpdate,
  type PhotoMergeDismiss,
  type PhotoItemFaces,
  type PhotoMergeSuggestion,
  type PhotoPeople,
  type PhotoRemoveFaces,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { DriveActor } from '../../drive/access';
import type { PhotoFacesRepository } from '../../store/repositories/photo-faces';
import { PhotoGroupMergeError, type PhotoGroupRow } from '../../store/repositories/photo-groups';
import { mergeSuggestions } from '../../vision/cluster';
import { PeopleGrouper, centroidsOf, partitions, thresholdOf, type GroupingDeps } from './grouping';
import { VISIBLE_ITEM, PeopleRows } from './rows';
import { GroupViews } from './views';

const KINDS: readonly PhotoGroupKind[] = ['person', 'pet'];

const PRESENT = z.strictObject({ found: z.int() });

const DISMISSED = z.strictObject({ group_a: z.string(), group_b: z.string() });

export interface PeopleDeps extends GroupingDeps {
  readonly faces: PhotoFacesRepository;
  readonly profiles: () => readonly string[];
}

export class PeopleService {
  private readonly rows: PeopleRows;
  private readonly views: GroupViews;
  private readonly grouper: PeopleGrouper;
  private readonly suggested = new Map<string, readonly PhotoMergeSuggestion[]>();
  private readonly chains = new Map<string, Promise<undefined>>();

  constructor(private readonly deps: PeopleDeps) {
    this.rows = new PeopleRows(deps.context);
    this.views = new GroupViews(deps.context, deps.groups);
    this.grouper = new PeopleGrouper(deps, (profileId) => {
      this.suggested.delete(profileId);
    });
  }

  async drained(): Promise<void> {
    for (const profileId of this.deps.profiles())
      for (const kind of KINDS) await this.regroup(profileId, kind);
  }

  regroup(profileId: string, kind: PhotoGroupKind): Promise<number> {
    const key = `${profileId}:${kind}`;
    const run = (this.chains.get(key) ?? Promise.resolve()).then(() =>
      this.grouper.regroup(profileId, kind),
    );
    const settled = run.then(
      () => undefined,
      () => undefined,
    );
    this.chains.set(key, settled);
    return run;
  }

  people(actor: DriveActor, kind?: PhotoGroupKind): PhotoPeople {
    const groups = this.views.list(actor.profileId, kind);
    const known = new Set(groups.map((group) => group.id));
    return {
      groups,
      mergeSuggestions: this.undismissed(
        actor.profileId,
        this.suggestionsOf(actor.profileId).filter((suggestion) =>
          suggestion.groupIds.every((id) => known.has(id)),
        ),
      ),
    };
  }

  dismissMerge(actor: DriveActor, dismiss: PhotoMergeDismiss): void {
    const [first, second] = dismiss.groupIds;
    const one = this.owned(actor, first);
    const other = this.owned(actor, second);
    if (one.kind !== other.kind || one.species !== other.species)
      throw new ApiError('invalid_request', 'Only the same kind of person or pet is suggested.');
    const [low, high] = first < second ? [first, second] : [second, first];
    this.deps.context.write(() => {
      this.deps.context.sql.run(
        'remember that two groups are not the same person',
        `insert or ignore into photo_merge_dismissals (profile_id, group_a, group_b, dismissed_at)
          values ($profileId, $low, $high, $at)`,
        { profileId: actor.profileId, low, high, at: this.deps.context.now() },
      );
    });
  }

  group(actor: DriveActor, groupId: string): PhotoGroup {
    return this.views.one(actor.profileId, groupId);
  }

  groupsMatching(actor: DriveActor, groupIds: readonly string[]): PhotoGroup[] {
    return this.views.list(actor.profileId, undefined, groupIds);
  }

  update(actor: DriveActor, groupId: string, patch: PhotoGroupUpdate): PhotoGroup {
    const row = this.owned(actor, groupId);
    if (patch.linkedProfileId !== undefined && patch.linkedProfileId !== null) {
      if (row.kind !== 'person')
        throw new ApiError('invalid_request', 'Only a person can be linked to a household member.');
      this.requireProfile(patch.linkedProfileId);
    }
    this.deps.context.write(() => {
      this.deps.groups.update(groupId, {
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
    this.deps.context.write(() => {
      try {
        this.deps.groups.merge(merge.targetId, merge.sourceIds);
      } catch (cause) {
        if (cause instanceof PhotoGroupMergeError)
          throw new ApiError('invalid_request', cause.message);
        throw cause;
      }
      this.confirm(merge.targetId);
    });
    this.suggested.delete(actor.profileId);
    return this.views.one(actor.profileId, merge.targetId);
  }

  async removeFaces(
    actor: DriveActor,
    groupId: string,
    body: PhotoRemoveFaces,
  ): Promise<PhotoGroup | null> {
    const row = this.owned(actor, groupId);
    const members = new Set(this.deps.groups.faceIds(groupId));
    const stray = body.faceIds.find((faceId) => !members.has(faceId));
    if (stray !== undefined)
      throw new ApiError('invalid_request', 'That face is not in this person or pet.');
    this.deps.groups.reject(groupId, body.faceIds);
    await this.regroup(actor.profileId, row.kind);
    this.suggested.delete(actor.profileId);
    const [view] = this.views.list(actor.profileId, undefined, [groupId]);
    return view ?? null;
  }

  itemFaces(actor: DriveActor, itemId: string): PhotoItemFaces {
    const { context, faces, groups } = this.deps;
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
    const row = this.deps.groups.find(groupId);
    if (row?.profileId !== actor.profileId)
      throw new ApiError('not_found', 'There is no such person or pet.');
    return row;
  }

  private requireProfile(profileId: string): void {
    const found = this.deps.context.sql.get(
      PRESENT,
      'select 1 as found from profiles where id = $profileId',
      { profileId },
    );
    if (found === undefined) throw new ApiError('not_found', 'There is no such household member.');
  }

  private confirm(groupId: string): void {
    this.deps.groups.assign(groupId, this.deps.groups.faceIds(groupId), 'confirmed');
  }

  private undismissed(
    profileId: string,
    suggestions: readonly PhotoMergeSuggestion[],
  ): readonly PhotoMergeSuggestion[] {
    const dismissed = new Set(
      this.deps.context.sql
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

  private suggestionsOf(profileId: string): readonly PhotoMergeSuggestion[] {
    const cached = this.suggested.get(profileId);
    if (cached !== undefined) return cached;
    const computed = KINDS.flatMap((kind) =>
      partitions(this.rows.visibleFaces(profileId, kind)).flatMap((part) =>
        mergeSuggestions(
          [...centroidsOf(part).values()].map((centroid) => centroid.group),
          new Set<string>(),
          thresholdOf(kind),
        ).map((suggestion): PhotoMergeSuggestion => ({
          groupIds: [suggestion.groupIds[0], suggestion.groupIds[1]],
          similarity: Math.min(1, suggestion.similarity),
        })),
      ),
    );
    this.suggested.set(profileId, computed);
    return computed;
  }
}
