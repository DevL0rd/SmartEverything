import type { SQLInputValue } from 'node:sqlite';
import { lockedFolderSql } from '../../drive/access';
import { photoMembership } from '../membership';

export const MEDIA_KINDS = "('image', 'video')";

export interface SubjectScope {
  readonly text: string;
  readonly parameters: Record<string, SQLInputValue>;
}

export function librarySubjectScope(item = 'i', root = 'r'): string {
  return `${item}.kind in ${MEDIA_KINDS} and not ${lockedFolderSql(item)}
    and ${photoMembership(item, root)}`;
}

export function subjectOf(profileId: string, isOwner: boolean): SubjectScope {
  return {
    text: `(r.scope = 'person' and r.owner_profile_id = $subject
      or r.scope = 'home' and $homeOwner = 1)`,
    parameters: { subject: profileId, homeOwner: isOwner ? 1 : 0 },
  };
}

export function everyone(): SubjectScope {
  return { text: '1 = 1', parameters: {} };
}

export const ITEMS_OF = `drive_items i join drive_roots r on r.id = i.root_id`;

export function itemsIn(scope: SubjectScope): string {
  return `select i.id from ${ITEMS_OF} where ${librarySubjectScope()} and ${scope.text}`;
}
