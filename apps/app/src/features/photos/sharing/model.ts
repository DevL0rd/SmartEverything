import type {
  AlbumActivity,
  AlbumMemberRole,
  PartnerShare,
  PhotoSharing,
  SharedAlbum,
} from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import { compareText } from '../../../format/text';
import { localDayKey } from '../../../format/time';
import { count } from '../../../format/number';
import { longDay } from '../model/media-text';

export interface Person {
  readonly id: string;
  readonly name: string;
}

export const SOMEONE = 'Someone';

export function nameOf(profileId: string, people: readonly Person[], me: string | null): string {
  if (profileId === me) return 'You';
  return people.find((person) => person.id === profileId)?.name ?? SOMEONE;
}

function listText(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`;
}

export interface NamedGroup {
  readonly id: string;
  readonly name: string | null;
}

export function groupNamesOf(groupIds: readonly string[], groups: readonly NamedGroup[]): string {
  if (groupIds.length === 0) return 'chosen people';
  return listText(
    groupIds.map((id) => groups.find((group) => group.id === id)?.name ?? 'an unnamed person'),
  );
}

const VERB: Readonly<Record<AlbumActivity['kind'], (onItem: boolean) => string>> = {
  added: () => 'added a photo',
  comment: (onItem) => (onItem ? 'commented on a photo' : 'commented'),
  like: (onItem) => (onItem ? 'liked a photo' : 'liked the album'),
  joined: () => 'joined',
  left: () => 'left',
};

export const ACTIVITY_ICON: Readonly<Record<AlbumActivity['kind'], IconName>> = {
  added: 'plus',
  comment: 'messageCircle',
  like: 'heart',
  joined: 'user',
  left: 'signOut',
};

export function activityLine(activity: AlbumActivity, who: string): string {
  return `${who} ${VERB[activity.kind](activity.itemId !== null)}`;
}

export interface ActivityDay {
  readonly day: string;
  readonly label: string;
  readonly entries: readonly AlbumActivity[];
}

export interface ActivityAlbum {
  readonly albumId: string;
  readonly title: string;
  readonly days: readonly ActivityDay[];
}

function dayTextOf(day: string, today: string, yesterday: string): string {
  if (day === today) return 'Today';
  return day === yesterday ? 'Yesterday' : longDay(day);
}

export interface DayContext {
  readonly today: string;
  readonly yesterday: string;
  readonly timeZone: string | null;
}

export function daysOf(entries: readonly AlbumActivity[], context: DayContext): ActivityDay[] {
  const days: ActivityDay[] = [];
  for (const entry of entries) {
    const day = localDayKey(entry.createdAt, context.timeZone);
    const last = days.at(-1);
    if (last?.day === day) {
      days[days.length - 1] = { ...last, entries: [...last.entries, entry] };
    } else {
      days.push({ day, label: dayTextOf(day, context.today, context.yesterday), entries: [entry] });
    }
  }
  return days;
}

export function feedOf(sharing: PhotoSharing, context: DayContext): readonly ActivityAlbum[] {
  const order: string[] = [];
  const byAlbum = new Map<string, AlbumActivity[]>();
  for (const entry of sharing.activity) {
    const list = byAlbum.get(entry.albumId);
    if (list === undefined) {
      order.push(entry.albumId);
      byAlbum.set(entry.albumId, [entry]);
    } else {
      list.push(entry);
    }
  }
  return order.map((albumId) => ({
    albumId,
    title: sharing.albums.find((album) => album.albumId === albumId)?.title ?? 'Shared album',
    days: daysOf(byAlbum.get(albumId) ?? [], context),
  }));
}

export type SharingState = 'loading' | 'error' | 'offline' | 'empty' | 'ready';

export function sharingStateOf(input: {
  readonly data: PhotoSharing | undefined;
  readonly failed: boolean;
  readonly live: boolean;
}): SharingState {
  if (input.data === undefined) {
    if (!input.live) return 'offline';
    return input.failed ? 'error' : 'loading';
  }
  const { albums, partners, activity } = input.data;
  return albums.length + partners.length + activity.length === 0 ? 'empty' : 'ready';
}

export interface PartnerSides {
  readonly outgoing: readonly PartnerShare[];
  readonly offered: readonly PartnerShare[];
  readonly receiving: readonly PartnerShare[];
}

export function partnerSidesOf(partners: readonly PartnerShare[], me: string | null): PartnerSides {
  const live = partners.filter((share) => share.state !== 'stopped');
  return {
    outgoing: live.filter((share) => share.sharerId === me),
    offered: live.filter((share) => share.recipientId === me && share.state === 'offered'),
    receiving: live.filter((share) => share.recipientId === me && share.state === 'accepted'),
  };
}

export function partnerScopeLine(share: PartnerShare, groupNames: string): string {
  const what = share.scope === 'all' ? 'All photos' : `Photos of ${groupNames}`;
  return `${what} from ${longDay(share.fromDay)}`;
}

export function partnerStateLine(share: PartnerShare, me: string | null): string {
  if (share.state === 'accepted') {
    return share.sharerId === me ? 'Sharing now' : 'You see their photos';
  }
  return share.sharerId === me ? 'Waiting for them to accept' : 'Wants to share photos with you';
}

export type AlbumRole = SharedAlbum['role'];

export function canAddPhotos(role: AlbumRole | null): boolean {
  return role === 'owner' || role === 'contributor';
}

export function roleOf(
  album: { readonly id: string; readonly ownerProfileId: string | null },
  shared: SharedAlbum | undefined,
  me: string | null,
): AlbumRole | null {
  if (shared !== undefined) return shared.role;
  return album.ownerProfileId === me ? 'owner' : null;
}

export const ROLE_LABEL: Readonly<Record<AlbumMemberRole | 'owner', string>> = {
  owner: 'Owner',
  contributor: 'Can add photos',
  viewer: 'Can view',
};

export function membersLine(memberIds: readonly string[]): string {
  return memberIds.length === 0 ? 'Only you' : `${count(memberIds.length + 1)} people`;
}

export function unreadText(unread: number): string | null {
  return unread === 0 ? null : `${count(unread)} new`;
}

export function likedBy(
  entries: readonly AlbumActivity[],
  itemId: string | null,
  me: string | null,
): AlbumActivity | undefined {
  return entries.find(
    (entry) => entry.kind === 'like' && entry.itemId === itemId && entry.profileId === me,
  );
}

export function likesOf(entries: readonly AlbumActivity[], itemId: string | null): number {
  return entries.filter((entry) => entry.kind === 'like' && entry.itemId === itemId).length;
}

export interface Contribution {
  readonly profileId: string;
  readonly items: number;
}

export function contributionsOf(
  items: readonly { readonly addedByProfileId: string | null }[],
): readonly Contribution[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.addedByProfileId !== null) {
      counts.set(item.addedByProfileId, (counts.get(item.addedByProfileId) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([profileId, total]) => ({ profileId, items: total }))
    .sort(
      (first, second) =>
        second.items - first.items || compareText(first.profileId, second.profileId),
    );
}
