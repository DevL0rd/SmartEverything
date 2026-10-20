import type { ClientRow } from '@smarteverything/domain';

export interface Viewer {
  readonly clientId: string;
  readonly role: ClientRow['role'];
  readonly profileId: string;
}

export function ownsSessions(
  viewer: Pick<Viewer, 'role' | 'profileId'>,
  personId: string | null,
): boolean {
  return viewer.role === 'owner' || (personId !== null && viewer.profileId === personId);
}
