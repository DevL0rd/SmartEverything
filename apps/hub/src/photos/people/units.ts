import {
  type PhotoGroupKind,
  type PhotoGroupMerge,
  type PhotoGroupUpdate,
  type PhotoMergeDismiss,
  type PhotoMergeSuggestion,
  type PhotoRemoveFaces,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { DriveActor } from '../../drive/access';
import { storeUnit } from '../../store/host/unit';
import type { Store } from '../../store/store';
import { PhotoConsent } from '../ai/consent';
import { mergeSuggestionsFor } from './merge-suggestions';
import { PeopleRecords, type GroupPlacement } from './records';
import { PhotoSuggest } from './suggest';

const log = new Logger('hub.photos');

export interface Grouped {
  readonly actor: DriveActor;
  readonly groupId: string;
}

export interface Regrouped {
  readonly profileId: string;
  readonly kind: PhotoGroupKind;
}

function recordsOf(store: Store): PeopleRecords {
  return new PeopleRecords({
    context: store.context,
    groups: store.photoGroups,
    faces: store.photoFaces,
    consent: new PhotoConsent(store, log),
  });
}

export const PHOTO_MERGE_SUGGESTIONS_UNIT = storeUnit(
  (store, input: { readonly profileId: string }) =>
    mergeSuggestionsFor(store.context, input.profileId),
);

export const PHOTO_PEOPLE_PROFILES_UNIT = storeUnit((store, _input: null) =>
  recordsOf(store).profiles(),
);

export const PHOTO_PEOPLE_REGROUP_SOURCE_UNIT = storeUnit((store, input: Regrouped) =>
  recordsOf(store).regroupSource(input.profileId, input.kind),
);

export const PHOTO_PEOPLE_PLACE_UNIT = storeUnit(
  (store, input: Regrouped & { readonly placements: readonly GroupPlacement[] }) => {
    recordsOf(store).place(input.profileId, input.kind, input.placements);
  },
);

export const PHOTO_PEOPLE_TIDY_UNIT = storeUnit((store, input: Regrouped) => {
  recordsOf(store).tidy(input.profileId, input.kind);
});

export const PHOTO_PEOPLE_UNIT = storeUnit(
  (
    store,
    input: {
      readonly actor: DriveActor;
      readonly kind: PhotoGroupKind | undefined;
      readonly suggestions: readonly PhotoMergeSuggestion[];
    },
  ) => recordsOf(store).people(input.actor, input.kind, input.suggestions),
);

export const PHOTO_PEOPLE_GROUP_UNIT = storeUnit((store, input: Grouped) =>
  recordsOf(store).group(input.actor, input.groupId),
);

export const PHOTO_PEOPLE_MATCHING_UNIT = storeUnit(
  (store, input: { readonly actor: DriveActor; readonly groupIds: readonly string[] }) =>
    recordsOf(store).groupsMatching(input.actor, input.groupIds),
);

export const PHOTO_PEOPLE_ITEM_FACES_UNIT = storeUnit(
  (store, input: { readonly actor: DriveActor; readonly itemId: string }) =>
    recordsOf(store).itemFaces(input.actor, input.itemId),
);

export const PHOTO_PEOPLE_SUGGEST_UNIT = storeUnit(
  (store, input: { readonly actor: DriveActor; readonly query: string }) =>
    new PhotoSuggest(store.context, store.photoGroups).read(input.actor, input.query),
);

export const PHOTO_PEOPLE_DISMISS_UNIT = storeUnit(
  (store, input: { readonly actor: DriveActor; readonly dismiss: PhotoMergeDismiss }) => {
    recordsOf(store).dismissMerge(input.actor, input.dismiss);
  },
);

export const PHOTO_PEOPLE_UPDATE_UNIT = storeUnit(
  (store, input: Grouped & { readonly patch: PhotoGroupUpdate }) =>
    recordsOf(store).update(input.actor, input.groupId, input.patch),
);

export const PHOTO_PEOPLE_MERGE_UNIT = storeUnit(
  (store, input: { readonly actor: DriveActor; readonly merge: PhotoGroupMerge }) =>
    recordsOf(store).merge(input.actor, input.merge),
);

export const PHOTO_PEOPLE_REJECT_UNIT = storeUnit(
  (store, input: Grouped & { readonly body: PhotoRemoveFaces }) =>
    recordsOf(store).rejectFaces(input.actor, input.groupId, input.body),
);
