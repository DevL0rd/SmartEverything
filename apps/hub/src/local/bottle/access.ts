import { ApiError, type Role } from '@smarteverything/domain';
import type { BottleEntryConfig } from './config';

export interface Viewer {
  readonly clientId: string;
  readonly role: Role;
  readonly profileId: string;
}

export type Standing = 'owner' | 'bound' | 'none';

export function standingOf(
  viewer: Pick<Viewer, 'role' | 'profileId'>,
  config: BottleEntryConfig,
): Standing {
  if (viewer.role === 'owner') {
    return 'owner';
  }
  return config.binding.profileId === viewer.profileId ? 'bound' : 'none';
}

export function assertStanding(
  viewer: Pick<Viewer, 'role' | 'profileId'>,
  config: BottleEntryConfig,
  name: string,
): Standing {
  const standing = standingOf(viewer, config);
  if (standing === 'none') {
    throw new ApiError('forbidden', `${name} belongs to another person.`);
  }
  return standing;
}
