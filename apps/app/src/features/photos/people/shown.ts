import {
  PHOTO_GROUP,
  PHOTO_ITEM_FACES,
  PHOTO_PEOPLE,
  type PhotoGroup,
  type PhotoGroupUpdate,
  type PhotoItemFaces,
  type PhotoPeople,
} from '@smarteverything/domain';
import { DRIVE_EVERYWHERE, driveKey } from '../../../queries/keys';
import { shownTarget, type ShownTarget } from '../../../queries/shown-query';

const PEOPLE_LISTS = driveKey('photo-people', DRIVE_EVERYWHERE, 'list');
const MEDIA = driveKey('photo-media', DRIVE_EVERYWHERE);

function groupKey(groupId: string): readonly unknown[] {
  return driveKey('photo-people', DRIVE_EVERYWHERE, 'group', groupId);
}

export function updatedGroup(group: PhotoGroup, patch: PhotoGroupUpdate): PhotoGroup {
  return {
    ...group,
    ...(patch.name === undefined ? {} : { name: patch.name }),
    ...(patch.linkedProfileId === undefined ? {} : { linkedProfileId: patch.linkedProfileId }),
    ...(patch.hidden === undefined ? {} : { hidden: patch.hidden }),
  };
}

export function lessFaces(group: PhotoGroup, removed: number): PhotoGroup | null {
  const count = group.count - removed;
  return count > 0 ? { ...group, count } : null;
}

type GroupChange = (group: PhotoGroup) => PhotoGroup | null;

function peopleWith(people: PhotoPeople, groupId: string, change: GroupChange): PhotoPeople {
  if (!people.groups.some((group) => group.id === groupId)) return people;
  const groups = people.groups.flatMap((group) => {
    if (group.id !== groupId) return [group];
    const next = change(group);
    return next === null ? [] : [next];
  });
  const kept = new Set(groups.map((group) => group.id));
  return {
    groups,
    mergeSuggestions: people.mergeSuggestions.filter((suggestion) =>
      suggestion.groupIds.every((id) => kept.has(id)),
    ),
  };
}

function groupTargets(groupId: string, change: GroupChange): readonly ShownTarget[] {
  return [
    shownTarget(PEOPLE_LISTS, PHOTO_PEOPLE, (people) => peopleWith(people, groupId, change)),
    shownTarget(groupKey(groupId), PHOTO_GROUP, (group) => change(group) ?? group),
  ];
}

export function updateTargets(group: PhotoGroup, patch: PhotoGroupUpdate): readonly ShownTarget[] {
  return groupTargets(group.id, (current) => updatedGroup(current, patch));
}

export function mergedPeople(
  people: PhotoPeople,
  targetId: string,
  sourceIds: ReadonlySet<string>,
): PhotoPeople {
  const added = people.groups
    .filter((group) => sourceIds.has(group.id))
    .reduce((total, group) => total + group.count, 0);
  return peopleWith(
    { ...people, groups: people.groups.filter((group) => !sourceIds.has(group.id)) },
    targetId,
    (group) => ({ ...group, count: group.count + added }),
  );
}

export function mergeTargets(
  target: PhotoGroup,
  sources: readonly PhotoGroup[],
): readonly ShownTarget[] {
  const sourceIds = new Set(sources.map((group) => group.id));
  const added = sources.reduce((total, group) => total + group.count, 0);
  return [
    shownTarget(PEOPLE_LISTS, PHOTO_PEOPLE, (people) => mergedPeople(people, target.id, sourceIds)),
    shownTarget(groupKey(target.id), PHOTO_GROUP, (group) => ({
      ...group,
      count: group.count + added,
    })),
  ];
}

export function withoutSuggestion(
  people: PhotoPeople,
  pair: readonly [string, string],
): PhotoPeople {
  return {
    ...people,
    mergeSuggestions: people.mergeSuggestions.filter(
      (suggestion) =>
        !(suggestion.groupIds.includes(pair[0]) && suggestion.groupIds.includes(pair[1])),
    ),
  };
}

export function dismissTargets(pair: readonly [string, string]): readonly ShownTarget[] {
  return [shownTarget(PEOPLE_LISTS, PHOTO_PEOPLE, (people) => withoutSuggestion(people, pair))];
}

export function facesWithout(item: PhotoItemFaces, faceIds: ReadonlySet<string>): PhotoItemFaces {
  if (!item.faces.some((face) => faceIds.has(face.id))) return item;
  return {
    ...item,
    faces: item.faces.map((face) =>
      faceIds.has(face.id) ? { ...face, groupId: null, groupName: null } : face,
    ),
  };
}

export function fewerTargets(groupId: string, removed: number): readonly ShownTarget[] {
  return groupTargets(groupId, (group) => lessFaces(group, removed));
}

export function removeTargets(groupId: string, faceIds: readonly string[]): readonly ShownTarget[] {
  const removed = new Set(faceIds);
  return [
    ...fewerTargets(groupId, removed.size),
    shownTarget(MEDIA, PHOTO_ITEM_FACES, (item) => facesWithout(item, removed)),
  ];
}
