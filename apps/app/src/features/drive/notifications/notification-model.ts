import {
  DRIVE_NOTIFICATION_KINDS,
  type DriveAccessRequest,
  type DriveFileRequest,
  type DriveNotification,
  type DriveNotificationKind,
  type DriveTransfer,
  type ProfileRow,
} from '@smarteverything/domain';
import type { IconName } from '../../../components/icon-glyphs';
import type { Tone } from '../../../components/tone';
import { plural } from '../../../format/text';
import { dayLabel, localDayKey } from '../../../format/time';
import { groupEdgeOf, type GroupEdge } from '../shared/shared-model';

type Person = Pick<ProfileRow, 'id' | 'name'>;

export interface NotificationContext {
  readonly actor: string;
  readonly item: string | null;
  readonly request: DriveAccessRequest | null;
  readonly transfer: DriveTransfer | null;
  readonly fileRequest: DriveFileRequest | null;
}

export interface NotificationLook {
  readonly icon: IconName;
  readonly tone: Tone;
}

export const KIND_LOOK: Readonly<Record<DriveNotificationKind, NotificationLook>> = {
  shared: { icon: 'share', tone: 'primary' },
  edited: { icon: 'pencil', tone: 'info' },
  commented: { icon: 'messageCircle', tone: 'info' },
  mentioned: { icon: 'messageCircle', tone: 'primary' },
  replied: { icon: 'messageCircle', tone: 'info' },
  access_requested: { icon: 'key', tone: 'warning' },
  access_answered: { icon: 'key', tone: 'positive' },
  file_request_upload: { icon: 'upload', tone: 'primary' },
  transfer_offered: { icon: 'user', tone: 'warning' },
  transfer_answered: { icon: 'user', tone: 'positive' },
};

export const KIND_LABEL: Readonly<Record<DriveNotificationKind, string>> = {
  shared: 'Shared with you',
  edited: 'Edits to your files',
  commented: 'Comments',
  mentioned: 'Mentions',
  replied: 'Replies to you',
  access_requested: 'Access requests',
  access_answered: 'Answers to your requests',
  file_request_upload: 'Files sent to your requests',
  transfer_offered: 'Ownership offers',
  transfer_answered: 'Answers to your offers',
};

export const PUSH_KIND_ORDER: readonly DriveNotificationKind[] = DRIVE_NOTIFICATION_KINDS;

const SOMETHING = 'a file';

function times(count: number): string {
  return count > 1 ? ` ${String(count)} times` : '';
}

function answeredLine(actor: string, item: string, request: DriveAccessRequest | null): string {
  if (request?.state === 'approved') return `${actor} gave you access to ${item}`;
  if (request?.state === 'declined') return `${actor} declined your request for ${item}`;
  return `${actor} answered your request for ${item}`;
}

function transferAnsweredLine(actor: string, item: string, transfer: DriveTransfer | null): string {
  if (transfer?.state === 'accepted') return `${actor} accepted ownership of ${item}`;
  if (transfer?.state === 'declined') return `${actor} declined ownership of ${item}`;
  return `${actor} answered your ownership offer for ${item}`;
}

type Sentence = (row: DriveNotification, context: NotificationContext, item: string) => string;

const SENTENCES: Readonly<Record<DriveNotificationKind, Sentence>> = {
  shared: (_row, { actor }, item) => `${actor} shared ${item} with you`,
  edited: (row, { actor }, item) => `${actor} edited ${item}${times(row.count)}`,
  commented: (row, { actor }, item) =>
    row.count > 1
      ? `${actor} left ${String(row.count)} comments on ${item}`
      : `${actor} commented on ${item}`,
  mentioned: (row, { actor }, item) => `${actor} mentioned you${times(row.count)} on ${item}`,
  replied: (row, { actor }, item) =>
    `${actor} replied${times(row.count)} to your comment on ${item}`,
  access_requested: (_row, { actor, request }, item) =>
    `${actor} asks to ${request?.role === 'edit' ? 'edit' : 'view'} ${item}`,
  access_answered: (_row, { actor, request }, item) => answeredLine(actor, item, request),
  file_request_upload: (row, { actor, fileRequest }, item) =>
    `${actor} sent ${plural(row.count, 'file')} to ${fileRequest?.title ?? item}`,
  transfer_offered: (_row, { actor }, item) => `${actor} offers you ownership of ${item}`,
  transfer_answered: (_row, { actor, transfer }, item) =>
    transferAnsweredLine(actor, item, transfer),
};

export function sentenceOf(row: DriveNotification, context: NotificationContext): string {
  const item = context.item ?? context.transfer?.itemName ?? context.request?.itemName ?? SOMETHING;
  return SENTENCES[row.kind](row, context, item);
}

export function actorOf(row: DriveNotification, profiles: readonly Person[]): string {
  if (row.actorName !== null) return row.actorName;
  return profiles.find((profile) => profile.id === row.actorProfileId)?.name ?? 'A former member';
}

export type RowAction =
  | { readonly kind: 'none' }
  | { readonly kind: 'answer-request'; readonly request: DriveAccessRequest }
  | { readonly kind: 'answer-transfer'; readonly transfer: DriveTransfer };

export function rowActionOf(
  row: DriveNotification,
  context: Pick<NotificationContext, 'request' | 'transfer'>,
  viewerId: string | null,
): RowAction {
  const { request, transfer } = context;
  if (
    row.kind === 'access_requested' &&
    request !== null &&
    request.state === 'pending' &&
    request.ownerProfileId === viewerId
  ) {
    return { kind: 'answer-request', request };
  }
  if (
    row.kind === 'transfer_offered' &&
    transfer !== null &&
    transfer.state === 'offered' &&
    transfer.toProfileId === viewerId
  ) {
    return { kind: 'answer-transfer', transfer };
  }
  return { kind: 'none' };
}

export interface DayGroup {
  readonly key: string;
  readonly label: string;
  readonly rows: readonly DriveNotification[];
}

export function dayGroupsOf(
  rows: readonly DriveNotification[],
  now: number,
  timeZone: string | null,
): readonly DayGroup[] {
  const sorted = [...rows].sort(
    (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
  );
  const groups: { key: string; label: string; rows: DriveNotification[] }[] = [];
  for (const row of sorted) {
    const key = localDayKey(row.updatedAt, timeZone);
    const last = groups.at(-1);
    if (last?.key === key) last.rows.push(row);
    else groups.push({ key, label: dayLabel(row.updatedAt, now, timeZone), rows: [row] });
  }
  return groups;
}

export function unreadIdsOf(rows: readonly DriveNotification[]): readonly string[] {
  return rows.filter((row) => row.readAt === null).map((row) => row.id);
}

export function subtitleOf(rows: readonly DriveNotification[]): string {
  const unread = unreadIdsOf(rows).length;
  if (rows.length === 0) return 'Nothing new';
  return unread === 0 ? 'All read' : `${String(unread)} unread`;
}

export function pushKindsAfter(
  kinds: readonly DriveNotificationKind[],
  kind: DriveNotificationKind,
  on: boolean,
): readonly DriveNotificationKind[] {
  const chosen = new Set(kinds);
  if (on) chosen.add(kind);
  else chosen.delete(kind);
  return PUSH_KIND_ORDER.filter((each) => chosen.has(each));
}

export const EMPTY_TITLE = 'No notifications yet';

export const EMPTY_BODY =
  'When someone shares with you, edits your files, comments, asks for access or offers you a file, it shows here.';

export interface NotificationLookups {
  readonly profiles: readonly Person[];
  readonly items: ReadonlyMap<string, { readonly name: string }>;
  readonly requests: readonly DriveAccessRequest[];
  readonly transfers: readonly DriveTransfer[];
  readonly fileRequests: readonly DriveFileRequest[];
}

function byRef<T extends { readonly id: string }>(
  rows: readonly T[],
  refId: string | null,
): T | null {
  if (refId === null) return null;
  return rows.find((row) => row.id === refId) ?? null;
}

export function contextOf(
  row: DriveNotification,
  lookups: NotificationLookups,
): NotificationContext {
  const request =
    row.kind === 'access_requested' || row.kind === 'access_answered'
      ? byRef(lookups.requests, row.refId)
      : null;
  const transfer =
    row.kind === 'transfer_offered' || row.kind === 'transfer_answered'
      ? byRef(lookups.transfers, row.refId)
      : null;
  const fileRequest =
    row.kind === 'file_request_upload' ? byRef(lookups.fileRequests, row.refId) : null;
  return {
    actor: actorOf(row, lookups.profiles),
    item: lookups.items.get(row.itemId)?.name ?? null,
    request,
    transfer,
    fileRequest,
  };
}

export function itemIdsOf(rows: readonly DriveNotification[]): readonly string[] {
  return [...new Set(rows.map((row) => row.itemId))];
}

export type InboxRow =
  | { readonly kind: 'day'; readonly key: string; readonly label: string }
  | {
      readonly kind: 'note';
      readonly row: DriveNotification;
      readonly edge: GroupEdge;
    };

export function inboxRowsOf(groups: readonly DayGroup[]): readonly InboxRow[] {
  return groups.flatMap((group) => [
    { kind: 'day' as const, key: group.key, label: group.label },
    ...group.rows.map((row, index) => ({
      kind: 'note' as const,
      row,
      edge: groupEdgeOf(index, group.rows.length),
    })),
  ]);
}

export function inboxKeyOf(row: InboxRow): string {
  return row.kind === 'day' ? `day:${row.key}` : `note:${row.row.id}`;
}
