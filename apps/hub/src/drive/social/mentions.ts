import { ApiError, type DriveItem } from '@smarteverything/domain';
import { peopleWithAccess, type AudienceStore } from './audience';

export function distinctMentions(mentions: readonly string[]): string[] {
  return [...new Set(mentions)];
}

export function checkMentions(
  store: AudienceStore,
  item: DriveItem,
  mentions: readonly string[],
): string[] {
  const distinct = distinctMentions(mentions);
  const people = peopleWithAccess(store, item);
  const known = new Map(store.profiles.list().map((profile) => [profile.id, profile.name]));
  for (const profileId of distinct) {
    const name = known.get(profileId);
    if (name === undefined) {
      throw new ApiError('invalid_request', 'There is no such person to mention.');
    }
    if (!people.some((person) => person.profileId === profileId)) {
      throw new ApiError(
        'invalid_request',
        `${name} cannot open ${item.name}; share it with them before mentioning them.`,
      );
    }
  }
  return distinct;
}
