import type {
  DriveGrant,
  DriveShare,
  DriveSharePermission,
  DriveSharedByMeEntry,
  DriveSharedWithMeEntry,
  ProfileRow,
} from '@smarteverything/domain';
import type { MetricItem } from '../../../components/metric-strip';
import { count } from '../../../format/number';
import { joinParts, plural } from '../../../format/text';
import { DAY_MS, HOUR_MS, relative, shortDate } from '../../../format/time';
import { ROLE_LABEL } from '../share/share-model';

export const SHARED_VIEWS = ['with-me', 'by-me'] as const;

export type SharedView = (typeof SHARED_VIEWS)[number];

export const WEEK_MS = 7 * DAY_MS;

export function sharedViewOf(param: string | null): SharedView {
  return param === 'by-me' ? 'by-me' : 'with-me';
}

const ACCESS_LABEL: Readonly<Record<DriveSharePermission, string>> = {
  view: 'View',
  download: 'View and download',
};

export function accessLabelOf(permission: DriveSharePermission): string {
  return ACCESS_LABEL[permission];
}

export function linkEnded(share: DriveShare, now: number): boolean {
  if (share.revokedAt !== null) return true;
  return share.expiresAt !== null && Date.parse(share.expiresAt) <= now;
}

export interface LinkGroups {
  readonly active: readonly DriveShare[];
  readonly ended: readonly DriveShare[];
}

export function linkGroupsOf(shares: readonly DriveShare[], now: number): LinkGroups {
  return {
    active: shares.filter((share) => !linkEnded(share, now)),
    ended: shares.filter((share) => linkEnded(share, now)),
  };
}

export function linkEndLabel(share: DriveShare, now: number): string {
  if (share.expiresAt === null) return 'No end';
  const left = Date.parse(share.expiresAt) - now;
  if (left < HOUR_MS) return 'Ends within the hour';
  if (left < DAY_MS) return `Ends in ${plural(Math.floor(left / HOUR_MS), 'hour')}`;
  return `Ends in ${plural(Math.floor(left / DAY_MS), 'day')}`;
}

export function endsThisWeek(share: DriveShare, now: number): boolean {
  return share.expiresAt !== null && Date.parse(share.expiresAt) - now < WEEK_MS;
}

export function endedLabelOf(share: DriveShare): string {
  if (share.revokedAt !== null) return `Stopped ${shortDate(share.revokedAt)}`;
  return share.expiresAt === null ? 'Ended' : `Ended ${shortDate(share.expiresAt)}`;
}

export function opensLabelOf(share: DriveShare): string {
  return joinParts([plural(share.opens, 'open'), plural(share.downloads, 'download')]);
}

function latestOpen(shares: readonly DriveShare[]): number | null {
  const opened = shares.flatMap((share) =>
    share.lastOpenedAt === null ? [] : [Date.parse(share.lastOpenedAt)],
  );
  return opened.length === 0 ? null : Math.max(...opened);
}

function opensItem(shares: readonly DriveShare[]): MetricItem {
  const opens = shares.reduce((all, share) => all + share.opens, 0);
  const downloads = shares.reduce((all, share) => all + share.downloads, 0);
  return {
    key: 'opens',
    label: 'Opens',
    value: count(opens),
    caption: plural(downloads, 'download'),
  };
}

function activeItem(active: readonly DriveShare[], now: number): MetricItem {
  const ending = active.filter((share) => endsThisWeek(share, now)).length;
  return {
    key: 'active',
    label: 'Active links',
    value: count(active.length),
    ...(ending === 0
      ? {}
      : { caption: `${count(ending)} ${ending === 1 ? 'ends' : 'end'} this week` }),
  };
}

export function linkStatsOf(groups: LinkGroups, now: number): readonly MetricItem[] {
  const all = [...groups.active, ...groups.ended];
  const latest = latestOpen(all);
  return [
    activeItem(groups.active, now),
    opensItem(all),
    {
      key: 'last-open',
      label: 'Last opened',
      value: latest === null ? 'Not yet' : shortDate(latest),
    },
    { key: 'ended', label: 'Ended links', value: count(groups.ended.length) },
  ];
}

export function personLabelOf(
  profileId: string,
  viewerId: string | null,
  profiles: readonly Pick<ProfileRow, 'id' | 'name'>[],
): string {
  if (profileId === viewerId) return 'You';
  return profiles.find((profile) => profile.id === profileId)?.name ?? 'A former member';
}

export type GroupEdge = 'only' | 'first' | 'middle' | 'last';

export function groupEdgeOf(index: number, total: number): GroupEdge {
  if (total <= 1) return 'only';
  if (index === 0) return 'first';
  return index === total - 1 ? 'last' : 'middle';
}

export function sharedAgoOf(at: string, now: number): string {
  return `Shared ${relative(at, now)}`;
}

type Person = Pick<ProfileRow, 'id' | 'name'>;

export interface SharerGroup<P extends Person> {
  readonly sharerId: string;
  readonly sharer: P | null;
  readonly name: string;
  readonly entries: readonly DriveSharedWithMeEntry[];
}

function newestFirst(left: DriveGrant, right: DriveGrant): number {
  return Date.parse(right.createdAt) - Date.parse(left.createdAt);
}

export function sharerGroupsOf<P extends Person>(
  entries: readonly DriveSharedWithMeEntry[],
  profiles: readonly P[],
): readonly SharerGroup<P>[] {
  const groups = new Map<string, DriveSharedWithMeEntry[]>();
  const sorted = [...entries].sort((left, right) => newestFirst(left.grant, right.grant));
  for (const entry of sorted) {
    const list = groups.get(entry.grant.grantedBy);
    if (list === undefined) groups.set(entry.grant.grantedBy, [entry]);
    else list.push(entry);
  }
  return [...groups.entries()].map(([sharerId, list]) => {
    const sharer = profiles.find((profile) => profile.id === sharerId) ?? null;
    return { sharerId, sharer, name: sharer?.name ?? 'A former member', entries: list };
  });
}

export function sharerLineOf(items: number): string {
  return `shared ${plural(items, 'item')}`;
}

export type WithMeRow<P extends Person> =
  | { readonly kind: 'sharer'; readonly group: SharerGroup<P> }
  | { readonly kind: 'item'; readonly entry: DriveSharedWithMeEntry; readonly edge: GroupEdge };

export function withMeRowsOf<P extends Person>(
  groups: readonly SharerGroup<P>[],
): readonly WithMeRow<P>[] {
  return groups.flatMap((group) => [
    { kind: 'sharer' as const, group },
    ...group.entries.map((entry, index) => ({
      kind: 'item' as const,
      entry,
      edge: groupEdgeOf(index, group.entries.length),
    })),
  ]);
}

export function withMeKeyOf<P extends Person>(row: WithMeRow<P>): string {
  return row.kind === 'sharer' ? `sharer:${row.group.sharerId}` : `item:${row.entry.grant.id}`;
}

export interface PersonChip {
  readonly key: string;
  readonly name: string;
  readonly role: string;
}

export function personChipsOf(
  grants: readonly DriveGrant[],
  profiles: readonly Person[],
): readonly PersonChip[] {
  return grants.map((grant) => ({
    key: grant.id,
    name: profiles.find((profile) => profile.id === grant.profileId)?.name ?? 'A former member',
    role: ROLE_LABEL[grant.role],
  }));
}

export interface LinkChip {
  readonly key: string;
  readonly label: string;
  readonly detail: string;
}

export function linkChipsOf(links: readonly DriveShare[], now: number): readonly LinkChip[] {
  return links
    .filter((link) => !linkEnded(link, now))
    .map((link) => ({
      key: link.id,
      label: link.hasPassword ? 'Link with password' : 'Link',
      detail: joinParts([linkEndLabel(link, now), plural(link.opens, 'open')]),
    }));
}

export function activeLinksOf(entry: DriveSharedByMeEntry, now: number): readonly DriveShare[] {
  return entry.links.filter((link) => !linkEnded(link, now));
}

export function stillSharedOf(entry: DriveSharedByMeEntry, now: number): boolean {
  return entry.grants.length > 0 || activeLinksOf(entry, now).length > 0;
}

export function byMeLinksOf(entries: readonly DriveSharedByMeEntry[]): readonly DriveShare[] {
  return entries.flatMap((entry) => entry.links);
}

export function withMeSubtitleOf(entries: readonly DriveSharedWithMeEntry[]): string {
  if (entries.length === 0) return 'Nothing shared with you yet';
  const people = new Set(entries.map((entry) => entry.grant.grantedBy)).size;
  return joinParts([plural(entries.length, 'item'), `from ${plural(people, 'person', 'people')}`]);
}

export function byMeSubtitleOf(items: number, groups: LinkGroups): string {
  if (items === 0) return 'You have not shared anything yet';
  return joinParts([plural(items, 'item'), plural(groups.active.length, 'active link')]);
}
