import {
  DRIVE_SHARE_CREATE,
  type DriveItem,
  type DriveRoot,
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
  return `Share ${item.name}`;
}

type Person = Pick<ProfileRow, 'id' | 'name'>;

export interface Audience<P extends Person = ProfileRow> {
  readonly people: readonly P[];
  readonly line: string;
  readonly from: string;
}

function ownerLine(
  ownerId: string | null,
  viewerId: string | null,
  people: readonly Person[],
): string {
  if (ownerId === viewerId) return 'Only you can open it';
  const name = people.find((person) => person.id === ownerId)?.name;
  return name === undefined ? 'Only its owner can open it' : `Only ${name} can open it`;
}

export function audienceOf<P extends Person>(
  root: Pick<DriveRoot, 'scope' | 'ownerProfileId' | 'readOnly' | 'label'>,
  profiles: readonly P[],
  viewerId: string | null,
): Audience<P> {
  const from = `from ${root.label}`;
  if (root.scope === 'home') {
    const verb = root.readOnly ? 'view' : 'edit';
    return { people: profiles, line: `Everyone in the home can ${verb}`, from };
  }
  const people = profiles.filter((profile) => profile.id === root.ownerProfileId);
  return { people, line: ownerLine(root.ownerProfileId, viewerId, profiles), from };
}

export function mayMakeLinks(
  owner: boolean,
  settings: Pick<DriveSettings, 'membersMayShare'> | null,
): boolean {
  return owner || settings?.membersMayShare === true;
}

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

export const LINKS_NOTE = 'Opens and downloads show in Shared › Links.';

export const MEMBERS_BLOCKED = 'The owner hasn’t allowed members to make links.';
