import type { QueryClient } from '@tanstack/react-query';
import type { PhotoGroup, PhotoGroupUpdate } from '@smarteverything/domain';
import { notify } from '../../../components/toast-store';
import { useShownWriter, type ShownWriter } from '../../../queries/shown-writer';
import { hiddenEdit, writeDriveShown } from '../../drive';
import {
  dismissPhotoMergeSuggestion,
  facesOfGroupIn,
  mergePhotoGroups,
  removePhotoGroupFaces,
  updatePhotoGroup,
} from './api';
import { groupTitleOf, photosText } from './model';
import { invalidatePeople } from './queries';
import {
  dismissTargets,
  fewerTargets,
  lessFaces,
  mergeTargets,
  removeTargets,
  updateTargets,
} from './shown';

export type GroupRef = Pick<PhotoGroup, 'id' | 'kind' | 'name' | 'species'>;

export interface PeopleActions {
  readonly busy: boolean;
  readonly update: (group: PhotoGroup, patch: PhotoGroupUpdate, onDone?: () => void) => void;
  readonly merge: (target: PhotoGroup, sources: readonly PhotoGroup[], onDone?: () => void) => void;
  readonly dismissMerge: (pair: readonly [PhotoGroup, PhotoGroup]) => void;
  readonly removeFaces: (group: GroupRef, faceIds: readonly string[]) => void;
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

function removedToast(group: GroupRef): () => void {
  return (): void => {
    notify({ message: `Removed from ${groupTitleOf(group)}` });
  };
}

function itemsHidden(
  client: QueryClient,
  group: PhotoGroup,
  itemIds: readonly string[],
): () => Promise<PhotoGroup | null> {
  return () =>
    writeDriveShown(client, {
      event: 'photos.people.items_hidden',
      edit: hiddenEdit(itemIds, (key) => JSON.stringify(key).includes(group.id)),
      send: () => removeOfItems(group, itemIds),
      incomplete: () => false,
    });
}

function removalsOf(
  client: QueryClient,
  write: ShownWriter,
): Pick<PeopleActions, 'removeFaces' | 'removeItems'> {
  return {
    removeFaces: (group, faceIds): void => {
      write({
        event: 'photos.people.remove_faces',
        targets: removeTargets(group.id, faceIds),
        send: () => removePhotoGroupFaces(group.id, faceIds),
        failure: 'Nothing was removed',
        saved: removedToast(group),
      });
    },
    removeItems: (group, itemIds, onDone): void => {
      write({
        event: 'photos.people.remove_items',
        targets: fewerTargets(group.id, itemIds.length),
        send: itemsHidden(client, group, itemIds),
        failure: 'Nothing was removed',
        saved: removedToast(group),
      });
      onDone?.(lessFaces(group, itemIds.length));
    },
  };
}

function actionsOf(client: QueryClient, write: ShownWriter): Omit<PeopleActions, 'busy'> {
  return {
    update: (group, patch, onDone): void => {
      write({
        event: 'photos.people.update',
        targets: updateTargets(group, patch),
        send: () => updatePhotoGroup(group.id, patch),
        failure: updateFailureOf(patch),
      });
      onDone?.();
    },
    merge: (target, sources, onDone): void => {
      const count = sources.reduce((total, group) => total + group.count, target.count);
      write({
        event: 'photos.people.merge',
        targets: mergeTargets(target, sources),
        send: () =>
          mergePhotoGroups({ targetId: target.id, sourceIds: sources.map((group) => group.id) }),
        failure: 'Nothing was merged',
      });
      notify({ message: `${groupTitleOf(target)} now has ${photosText(count)}` });
      onDone?.();
    },
    dismissMerge: (pair): void => {
      write({
        event: 'photos.people.dismiss_merge',
        targets: dismissTargets([pair[0].id, pair[1].id]),
        send: () => dismissPhotoMergeSuggestion([pair[0].id, pair[1].id]),
        failure: 'The suggestion was not dismissed',
      });
    },
    ...removalsOf(client, write),
  };
}

export function usePeopleActions(): PeopleActions {
  const { busy, write, client } = useShownWriter(invalidatePeople);
  return { busy, ...actionsOf(client, write) };
}
