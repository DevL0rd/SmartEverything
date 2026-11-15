import type { ProfileRow } from '@smarteverything/domain';
import { useMinute } from '../../../store/clock';
import { useProfiles } from '../../../store/people';
import { useSession, useSyncStatus } from '../../../store/selectors';
import { useDriveGrantRows } from '../data';
import type { DetailsSubject } from '../details/details-model';
import { useDriveAncestors } from '../source/drive-folder';
import { mayComment, moderatesComments, seesOf } from './comments-model';

export interface CommentContext {
  readonly subject: DetailsSubject;
  readonly viewerId: string | null;
  readonly moderator: boolean;
  readonly writable: boolean;
  readonly people: readonly ProfileRow[];
  readonly nameOf: (profileId: string) => string | null;
  readonly sees: ((profileId: string) => boolean) | null;
  readonly now: number;
}

function useSees(subject: DetailsSubject): ((profileId: string) => boolean) | null {
  const grants = useDriveGrantRows();
  const owns = subject.access === 'own';
  const ancestors = useDriveAncestors(subject.item, null, owns);
  if (!owns || ancestors === undefined) return null;
  return seesOf({
    ownerProfileId: subject.ownerProfileId,
    coveringIds: [subject.item.id, ...ancestors.map((ancestor) => ancestor.id)],
    grants,
  });
}

export function useCommentContext(subject: DetailsSubject): CommentContext {
  const viewerId = useSession().client.profile_id;
  const people = useProfiles();
  const online = useSyncStatus().status === 'live';
  return {
    subject,
    viewerId,
    moderator: moderatesComments(subject.access),
    writable: mayComment(subject.access, online),
    people,
    nameOf: (profileId) => people.find((person) => person.id === profileId)?.name ?? null,
    sees: useSees(subject),
    now: useMinute(),
  };
}
