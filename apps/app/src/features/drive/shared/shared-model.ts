import type {
  DriveAlbum,
  DriveItem,
  DriveRoot,
  DriveShare,
  DriveSharePermission,
  DriveSyncClient,
  ProfileRow,
} from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import type { MetricItem } from '../../../components/metric-strip';
import { bytes, count } from '../../../format/number';
import { joinParts, plural } from '../../../format/text';
import { DAY_MS, HOUR_MS, shortDate } from '../../../format/time';

export const SHARED_VIEWS = ['home', 'links'] as const;

export type SharedView = (typeof SHARED_VIEWS)[number];

export const WEEK_MS = 7 * DAY_MS;

export function sharedViewOf(param: string | null): SharedView {
  return param === 'links' ? 'links' : 'home';
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
  if (share.revokedAt !== null) return `Revoked ${shortDate(share.revokedAt)}`;
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

export function linksSubtitleOf(groups: LinkGroups): string {
  const opens = [...groups.active, ...groups.ended].reduce((all, share) => all + share.opens, 0);
  return joinParts([plural(groups.active.length, 'active link'), plural(opens, 'open')]);
}

export function linksScopeOf(owner: boolean): string {
  return owner ? 'You see every link in the home.' : 'You see the links you made.';
}

export type GroupEdge = 'only' | 'first' | 'middle' | 'last';

export function groupEdgeOf(index: number, total: number): GroupEdge {
  if (total <= 1) return 'only';
  if (index === 0) return 'first';
  return index === total - 1 ? 'last' : 'middle';
}

export type LinkListRow =
  | { readonly kind: 'link'; readonly share: DriveShare; readonly edge: GroupEdge }
  | { readonly kind: 'ended-toggle'; readonly count: number; readonly open: boolean }
  | { readonly kind: 'ended'; readonly share: DriveShare; readonly edge: GroupEdge };

export function linkListRowsOf(groups: LinkGroups, endedOpen: boolean): readonly LinkListRow[] {
  const { active, ended } = groups;
  const links = active.map((share, index) => ({
    kind: 'link' as const,
    share,
    edge: groupEdgeOf(index, active.length),
  }));
  if (ended.length === 0) return links;
  const toggle = { kind: 'ended-toggle' as const, count: ended.length, open: endedOpen };
  const shown = endedOpen
    ? ended.map((share, index) => ({
        kind: 'ended' as const,
        share,
        edge: groupEdgeOf(index, ended.length),
      }))
    : [];
  return [...links, toggle, ...shown];
}

export function linkRowKeyOf(row: LinkListRow): string {
  return row.kind === 'ended-toggle' ? 'ended-toggle' : `${row.kind}:${row.share.id}`;
}

export type LinkDensity = 'compact' | 'medium' | 'wide';

export function linkDensityOf(compact: boolean, wide: boolean): LinkDensity {
  if (compact) return 'compact';
  return wide ? 'wide' : 'medium';
}

export interface LinkLines {
  readonly by: string;
  readonly end: string;
  readonly place: string | null;
}

function subtitlePartsOf(
  share: DriveShare,
  lines: LinkLines,
  density: LinkDensity,
): readonly (string | null)[] {
  if (density === 'wide') return [lines.place];
  if (density === 'medium') return [lines.place, `by ${lines.by}`, lines.end];
  return [
    accessLabelOf(share.permission),
    share.hasPassword ? 'Password' : null,
    opensLabelOf(share),
    lines.end,
    `by ${lines.by}`,
  ];
}

export function linkSubtitleOf(
  share: DriveShare,
  lines: LinkLines,
  density: LinkDensity,
): string | undefined {
  const text = joinParts(subtitlePartsOf(share, lines, density));
  return text === '' ? undefined : text;
}

export function personLabelOf(
  profileId: string,
  viewerId: string | null,
  profiles: readonly Pick<ProfileRow, 'id' | 'name'>[],
): string {
  if (profileId === viewerId) return 'You';
  return profiles.find((profile) => profile.id === profileId)?.name ?? 'A former member';
}

const KIND_ICON: Readonly<Record<DriveItem['kind'], IconName>> = {
  folder: 'folder',
  image: 'image',
  video: 'film',
  audio: 'music',
  document: 'fileText',
  other: 'fileText',
};

export interface LinkItem {
  readonly title: string;
  readonly icon: IconName;
  readonly place: string | null;
}

export const MISSING_ITEM: LinkItem = {
  title: 'No longer available',
  icon: 'fileText',
  place: null,
};

export const LOADING_ITEM: LinkItem = { title: 'Shared item', icon: 'link', place: null };

export function linkItemOf(
  item: Pick<DriveItem, 'kind' | 'name' | 'rootId' | 'relPath'>,
  roots: readonly Pick<DriveRoot, 'id' | 'label'>[],
): LinkItem {
  const root = roots.find((each) => each.id === item.rootId);
  const folders = item.relPath.split('/').slice(0, -1);
  const place = [root?.label, ...folders].filter((part) => part !== undefined && part !== '');
  return {
    title: item.name,
    icon: KIND_ICON[item.kind],
    place: place.length === 0 ? null : place.join(' › '),
  };
}

export function homeScopedOf<T extends { readonly scope: 'home' | 'person' }>(
  rows: readonly T[],
): readonly T[] {
  return rows.filter((row) => row.scope === 'home');
}

export function rootAccessOf(root: Pick<DriveRoot, 'readOnly'>): string {
  return root.readOnly ? 'Can view' : 'Can edit';
}

export function rootLineOf(
  root: Pick<DriveRoot, 'id' | 'bytes' | 'items' | 'synced'>,
  clients: readonly Pick<DriveSyncClient, 'rootId' | 'deviceId' | 'enabled'>[],
): string {
  const computers = new Set(
    clients
      .filter((client) => client.rootId === root.id && client.enabled)
      .map((client) => client.deviceId),
  ).size;
  return joinParts([
    bytes(root.bytes),
    plural(root.items, 'file'),
    root.synced && computers > 0 ? `synced to ${plural(computers, 'computer')}` : null,
  ]);
}

export function albumLineOf(album: Pick<DriveAlbum, 'kind' | 'itemCount'>): string {
  return joinParts([
    album.kind === 'smart' ? 'Smart album' : 'Album',
    plural(album.itemCount, 'item'),
  ]);
}

export function homeSubtitleOf(roots: number, albums: number): string {
  return (
    joinParts([
      roots === 0 ? null : plural(roots, 'library folder'),
      albums === 0 ? null : plural(albums, 'album'),
    ]) || 'Nothing shared with the home yet'
  );
}
