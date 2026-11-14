import {
  DRIVE_GRANT_ROLES,
  DRIVE_SHARE_CREATE,
  type DriveGrant,
  type DriveGrantRole,
  type DriveItem,
  type DriveSettings,
  type DriveShare,
  type DriveShareCreate,
  type DriveSharePermission,
  type ProfileRow,
} from '@smarteverything/domain';
import type { MetricItem } from '../../../components/metric-strip';
import type { SegmentedOption } from '../../../components/segmented';
import { count } from '../../../format/number';
import { DAY_MS } from '../../../format/time';
import type { LinkGroups } from '../shared/shared-model';
import { canShareLink, type DriveAccess } from '../model/drive-access';

export const LINK_ENDS = ['day', 'week', 'month', 'never'] as const;

export type LinkEnd = (typeof LINK_ENDS)[number];

const END_DAYS: Readonly<Record<LinkEnd, number | null>> = {
  day: 1,
  week: 7,
  month: 30,
  never: null,
};

export const END_OPTIONS: readonly SegmentedOption<LinkEnd>[] = [
  { value: 'day', label: '1 day' },
  { value: 'week', label: '7 days' },
  { value: 'month', label: '30 days' },
  { value: 'never', label: 'Never' },
];

export function accessOptionsOf(narrow: boolean): readonly SegmentedOption<DriveSharePermission>[] {
  return [
    { value: 'view', label: 'View' },
    narrow
      ? { value: 'download', label: 'Download', spoken: 'View and download' }
      : { value: 'download', label: 'View and download' },
  ];
}

export interface ShareDraft {
  readonly permission: DriveSharePermission;
  readonly end: LinkEnd;
  readonly password: string | null;
}

export const NEW_DRAFT: ShareDraft = { permission: 'view', end: 'never', password: null };

export function expiryOf(end: LinkEnd, now: number): string | null {
  const days = END_DAYS[end];
  return days === null ? null : new Date(now + days * DAY_MS).toISOString();
}

export function draftReady(draft: ShareDraft): boolean {
  return draft.password === null || draft.password.length > 0;
}

export function shareRequestOf(
  itemId: string,
  draft: ShareDraft,
  now: number,
): DriveShareCreate | null {
  if (!draftReady(draft)) return null;
  return DRIVE_SHARE_CREATE.parse({
    itemId,
    permission: draft.permission,
    expiresAt: expiryOf(draft.end, now),
    password: draft.password,
  });
}

export function shareTitleOf(item: Pick<DriveItem, 'name'>): string {
  return `Share ‘${item.name}’`;
}

export type PeopleMode = 'manage' | 'owner-only' | 'everyone';

export function peopleModeOf(access: DriveAccess): PeopleMode {
  if (access === 'own') return 'manage';
  return access === 'shared' ? 'everyone' : 'owner-only';
}

export const OWNER_ONLY = 'Only the owner can share';

export const EVERYONE_LINE = 'Everyone in the home can open and edit this';

export function footerLineOf(access: DriveAccess, ownerName: string | null): string {
  if (access === 'shared') {
    return 'Everyone in the home can already open this; you can still make a link';
  }
  if (access === 'own') return 'Only you and the people above can open this';
  return ownerName === null
    ? 'Only its owner and the people above can open this'
    : `Only ${ownerName} and the people above can open this`;
}

export const ROLE_LABEL: Readonly<Record<DriveGrantRole, string>> = {
  view: 'Can view',
  edit: 'Can edit',
};

export const ROLE_OPTIONS: readonly SegmentedOption<DriveGrantRole>[] = DRIVE_GRANT_ROLES.map(
  (role) => ({ value: role, label: ROLE_LABEL[role] }),
);

type Person = Pick<ProfileRow, 'id' | 'name'>;

export interface SharedPerson<P extends Person> {
  readonly grant: DriveGrant;
  readonly profile: P | null;
  readonly name: string;
}

export function sharedPeopleOf<P extends Person>(
  grants: readonly DriveGrant[],
  itemId: string,
  profiles: readonly P[],
  viewerId: string | null,
): readonly SharedPerson<P>[] {
  return grants
    .filter((grant) => grant.itemId === itemId)
    .map((grant) => {
      const profile = profiles.find((each) => each.id === grant.profileId) ?? null;
      const name = grant.profileId === viewerId ? 'You' : (profile?.name ?? 'A former member');
      return { grant, profile, name };
    });
}

export function candidatesOf<P extends Person>(
  profiles: readonly P[],
  people: readonly SharedPerson<P>[],
  ownerId: string | null,
): readonly P[] {
  const taken = new Set(people.map((person) => person.grant.profileId));
  return profiles.filter((profile) => profile.id !== ownerId && !taken.has(profile.id));
}

export type LinkState = 'allowed' | 'members-off' | 'owner-only';

export function linkStateOf(
  access: DriveAccess,
  owner: boolean,
  settings: Pick<DriveSettings, 'membersMayShare'> | null,
): LinkState {
  if (!canShareLink(access)) return 'owner-only';
  return owner || settings?.membersMayShare === true ? 'allowed' : 'members-off';
}

export const LINK_STATE_LINE: Readonly<Record<Exclude<LinkState, 'allowed'>, string>> = {
  'members-off': 'The home owner turned off links for members',
  'owner-only': OWNER_ONLY,
};

function sum(shares: readonly DriveShare[], pick: (share: DriveShare) => number): number {
  return shares.reduce((total, share) => total + pick(share), 0);
}

export function itemLinkStatsOf(groups: LinkGroups): readonly MetricItem[] {
  const all = [...groups.active, ...groups.ended];
  return [
    { key: 'active', label: 'Active links', value: count(groups.active.length) },
    { key: 'opens', label: 'Opens', value: count(sum(all, (share) => share.opens)) },
    { key: 'downloads', label: 'Downloads', value: count(sum(all, (share) => share.downloads)) },
  ];
}

export function reachOf(isPublic: boolean): string {
  return isPublic
    ? 'Anyone with the link can open it.'
    : 'The hub has no public address yet, so this link opens only on your home network.';
}

export const LINKS_NOTE = 'Opens and downloads show in Shared › By me.';
