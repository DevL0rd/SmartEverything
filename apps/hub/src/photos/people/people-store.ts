import type {
  PhotoGroup,
  PhotoGroupKind,
  PhotoGroupMerge,
  PhotoGroupUpdate,
  PhotoItemFaces,
  PhotoMergeDismiss,
  PhotoMergeSuggestion,
  PhotoPeople,
  PhotoRemoveFaces,
  PhotoSuggestions,
} from '@smarteverything/domain';
import type { DriveActor } from '../../drive/access';
import type { StoreHost } from '../../store/host/host';
import type { GroupPlacement, RegroupSource } from './records';

export interface PeopleStore {
  readonly profiles: () => Promise<readonly string[]>;
  readonly regroupSource: (profileId: string, kind: PhotoGroupKind) => Promise<RegroupSource>;
  readonly place: (
    profileId: string,
    kind: PhotoGroupKind,
    placements: readonly GroupPlacement[],
  ) => Promise<void>;
  readonly tidy: (profileId: string, kind: PhotoGroupKind) => Promise<void>;
  readonly people: (
    actor: DriveActor,
    kind: PhotoGroupKind | undefined,
    suggestions: readonly PhotoMergeSuggestion[],
  ) => Promise<PhotoPeople>;
  readonly group: (actor: DriveActor, groupId: string) => Promise<PhotoGroup>;
  readonly groupsMatching: (
    actor: DriveActor,
    groupIds: readonly string[],
  ) => Promise<PhotoGroup[]>;
  readonly itemFaces: (actor: DriveActor, itemId: string) => Promise<PhotoItemFaces>;
  readonly suggest: (actor: DriveActor, query: string) => Promise<PhotoSuggestions>;
  readonly dismissMerge: (actor: DriveActor, dismiss: PhotoMergeDismiss) => Promise<void>;
  readonly update: (
    actor: DriveActor,
    groupId: string,
    patch: PhotoGroupUpdate,
  ) => Promise<PhotoGroup>;
  readonly merge: (actor: DriveActor, merge: PhotoGroupMerge) => Promise<PhotoGroup>;
  readonly rejectFaces: (
    actor: DriveActor,
    groupId: string,
    body: PhotoRemoveFaces,
  ) => Promise<PhotoGroupKind>;
}

export function hostedPeople(host: StoreHost): PeopleStore {
  return {
    profiles: () => host.read('photoPeopleProfiles', null),
    regroupSource: (profileId, kind) => host.read('photoPeopleRegroupSource', { profileId, kind }),
    place: (profileId, kind, placements) =>
      host.write('photoPeoplePlace', { profileId, kind, placements }),
    tidy: (profileId, kind) => host.write('photoPeopleTidy', { profileId, kind }),
    people: (actor, kind, suggestions) => host.read('photoPeople', { actor, kind, suggestions }),
    group: (actor, groupId) => host.read('photoPeopleGroup', { actor, groupId }),
    groupsMatching: (actor, groupIds) => host.read('photoPeopleMatching', { actor, groupIds }),
    itemFaces: (actor, itemId) => host.read('photoPeopleItemFaces', { actor, itemId }),
    suggest: (actor, query) => host.read('photoPeopleSuggest', { actor, query }),
    dismissMerge: (actor, dismiss) => host.write('photoPeopleDismiss', { actor, dismiss }),
    update: (actor, groupId, patch) => host.write('photoPeopleUpdate', { actor, groupId, patch }),
    merge: (actor, merge) => host.write('photoPeopleMerge', { actor, merge }),
    rejectFaces: (actor, groupId, body) =>
      host.write('photoPeopleReject', { actor, groupId, body }),
  };
}
