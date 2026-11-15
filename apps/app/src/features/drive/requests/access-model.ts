import type {
  DriveAccessAnswer,
  DriveAccessRequest,
  DriveGrantRole,
  DriveItem,
  DriveOpenItem,
} from '@smarteverything/domain';
import type { SegmentedOption } from '../../../components/segmented';
import { relative } from '../../../format/time';

export const WANTED_ROLE_OPTIONS: readonly SegmentedOption<DriveGrantRole>[] = [
  { value: 'view', label: 'View' },
  { value: 'edit', label: 'Edit' },
];

const WANTS: Readonly<Record<DriveGrantRole, string>> = { view: 'view', edit: 'edit' };

export type AccessScreenState =
  | { readonly kind: 'open'; readonly item: DriveItem }
  | { readonly kind: 'ask' }
  | { readonly kind: 'sent'; readonly request: DriveAccessRequest }
  | { readonly kind: 'declined'; readonly request: DriveAccessRequest }
  | { readonly kind: 'unavailable' };

export function accessScreenStateOf(open: DriveOpenItem): AccessScreenState {
  if (open.access !== 'none') return { kind: 'open', item: open.item };
  const request = open.pendingRequest;
  if (request !== null && request.state === 'pending') return { kind: 'sent', request };
  if (!open.requestable) return { kind: 'unavailable' };
  if (request !== null && request.state === 'declined') return { kind: 'declined', request };
  return { kind: 'ask' };
}

export const ASK_TITLE = 'You need access';

export function askBodyOf(ownerName: string | null): string {
  return ownerName === null
    ? 'Ask its owner to share it with you. They see your name and your message.'
    : `Ask ${ownerName} to share it with you. They see your name and your message.`;
}

export function sentLineOf(
  request: DriveAccessRequest,
  now: number,
  ownerName: string | null,
): string {
  const who = ownerName ?? 'The owner';
  return `Request sent ${relative(request.createdAt, now)}. ${who} gets a notification and can approve it.`;
}

export function declinedLineOf(
  request: DriveAccessRequest,
  now: number,
  ownerName: string | null,
): string {
  const who = ownerName ?? 'The owner';
  return request.answeredAt === null
    ? `${who} declined your request.`
    : `${who} declined your request ${relative(request.answeredAt, now)}. You can ask again.`;
}

export const UNAVAILABLE_TITLE = 'This file is not available';

export const UNAVAILABLE_BODY =
  'It may have been deleted, or the link is wrong. Ask the person who sent it for a new one.';

export function messageOf(text: string): string | null {
  const trimmed = text.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function pendingRequestsFor(
  rows: readonly DriveAccessRequest[],
  itemId: string,
  viewerId: string | null,
): readonly DriveAccessRequest[] {
  return rows
    .filter(
      (row) => row.itemId === itemId && row.state === 'pending' && row.ownerProfileId === viewerId,
    )
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
}

export function wantsLineOf(request: Pick<DriveAccessRequest, 'role'>, name: string): string {
  return `${name} wants to ${WANTS[request.role]}`;
}

export function approvalOf(request: Pick<DriveAccessRequest, 'role'>): DriveAccessAnswer {
  return { decision: 'approve', role: request.role, expiresAt: null };
}

export const DECLINE: DriveAccessAnswer = { decision: 'decline' };

export function requestsTitleOf(count: number): string {
  return count === 1 ? 'Access request' : `Access requests · ${String(count)}`;
}
