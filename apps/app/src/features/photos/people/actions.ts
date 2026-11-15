import type { PhotoGroup, PhotoGroupUpdate } from '@smarteverything/domain';
import { notify } from '../../../components/toast-store';
import { useMutationState } from '../../../store/mutation';
import {
  dismissPhotoMergeSuggestion,
  facesOfGroupIn,
  mergePhotoGroups,
  removePhotoGroupFaces,
  updatePhotoGroup,
} from './api';
import { groupTitleOf, photosText } from './model';
import { usePeopleRefresh } from './queries';

export type GroupRef = Pick<PhotoGroup, 'id' | 'kind' | 'name' | 'species'>;

export interface PeopleActions {
  readonly busy: boolean;
  readonly update: (group: PhotoGroup, patch: PhotoGroupUpdate, onDone?: () => void) => void;
  readonly merge: (target: PhotoGroup, sources: readonly PhotoGroup[], onDone?: () => void) => void;
  readonly dismissMerge: (pair: readonly [PhotoGroup, PhotoGroup]) => void;
  readonly removeFaces: (
    group: GroupRef,
    faceIds: readonly string[],
    onDone?: (left: PhotoGroup | null) => void,
  ) => void;
  readonly removeItems: (
    group: PhotoGroup,
    itemIds: readonly string[],
    onDone?: (left: PhotoGroup | null) => void,
  ) => void;
}

export function updateFailureOf(patch: PhotoGroupUpdate): string {
  if (patch.hidden !== undefined) return patch.hidden ? 'Nothing was hidden' : 'Nothing was shown';
  if (patch.linkedProfileId !== undefined) return 'The link was not saved';
  return 'The name was not saved';
}

export function notThisText(kind: PhotoGroup['kind']): string {
  return kind === 'pet' ? 'Not this pet' : 'Not this person';
}

async function removeOfItems(
  group: PhotoGroup,
  itemIds: readonly string[],
): Promise<PhotoGroup | null> {
  const faceIds = await facesOfGroupIn(group.id, itemIds);
  if (faceIds.length === 0) return group;
  return removePhotoGroupFaces(group.id, faceIds);
}

type Left = (left: PhotoGroup | null) => void;

function removedOf(refresh: () => void, group: GroupRef, onDone?: Left): Left {
  return (left): void => {
    refresh();
    notify({ message: `Removed from ${groupTitleOf(group)}` });
    onDone?.(left);
  };
}

function mergedOf(refresh: () => void, onDone?: () => void): (merged: PhotoGroup) => void {
  return (merged): void => {
    refresh();
    notify({ message: `${groupTitleOf(merged)} now has ${photosText(merged.count)}` });
    onDone?.();
  };
}

function mergeOf(target: PhotoGroup, sources: readonly PhotoGroup[]): () => Promise<PhotoGroup> {
  return () =>
    mergePhotoGroups({ targetId: target.id, sourceIds: sources.map((group) => group.id) });
}

export function usePeopleActions(): PeopleActions {
  const mutation = useMutationState();
  const refresh = usePeopleRefresh();
  return {
    busy: mutation.busy,
    update: (group, patch, onDone): void => {
      mutation.run(() => updatePhotoGroup(group.id, patch), {
        failure: updateFailureOf(patch),
        label: 'photos.people.update',
        onDone: () => {
          refresh();
          onDone?.();
        },
      });
    },
    merge: (target, sources, onDone): void => {
      mutation.run(mergeOf(target, sources), {
        failure: 'Nothing was merged',
        label: 'photos.people.merge',
        onDone: mergedOf(refresh, onDone),
      });
    },
    dismissMerge: (pair): void => {
      mutation.run(() => dismissPhotoMergeSuggestion([pair[0].id, pair[1].id]), {
        failure: 'The suggestion was not dismissed',
        label: 'photos.people.dismiss_merge',
        onDone: refresh,
      });
    },
    removeFaces: (group, faceIds, onDone): void => {
      mutation.run(() => removePhotoGroupFaces(group.id, faceIds), {
        failure: 'Nothing was removed',
        label: 'photos.people.remove_faces',
        onDone: removedOf(refresh, group, onDone),
      });
    },
    removeItems: (group, itemIds, onDone): void => {
      mutation.run(() => removeOfItems(group, itemIds), {
        failure: 'Nothing was removed',
        label: 'photos.people.remove_items',
        onDone: removedOf(refresh, group, onDone),
      });
    },
  };
}
