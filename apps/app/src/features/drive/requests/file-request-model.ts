import {
  DRIVE_FILE_REQUEST_CHANGE,
  DRIVE_FILE_REQUEST_CREATE,
  type DriveFileRequest,
  type DriveFileRequestChange,
  type DriveFileRequestCreate,
  type DriveItem,
  type DriveSettings,
} from '@smarteverything/domain';
import type { ConfirmRequest } from '../../../components/confirm-store';
import type { SelectOption } from '../../../components/select-picker';
import { bytes } from '../../../format/number';
import { joinParts, plural } from '../../../format/text';
import { shortDate } from '../../../format/time';
import type { DriveAccess } from '../model/drive-access';
import { endLabelOf } from '../share/grant-expiry';
import { expiryOf, linkStateOf, type LinkEnd } from '../share/share-model';

export type RequestEnd = LinkEnd | 'keep';

export interface FileRequestDraft {
  readonly title: string;
  readonly message: string;
  readonly end: RequestEnd;
}

export function newDraftOf(folderName: string): FileRequestDraft {
  return { title: `Files for ${folderName}`, message: '', end: 'never' };
}

export function editDraftOf(request: DriveFileRequest): FileRequestDraft {
  return { title: request.title, message: request.message ?? '', end: 'keep' };
}

export function requestEndOptionsOf(
  current: DriveFileRequest | null,
  now: number,
): readonly SelectOption<RequestEnd>[] {
  const keep: readonly SelectOption<RequestEnd>[] =
    current === null
      ? []
      : [
          {
            value: 'keep',
            label:
              current.expiresAt === null
                ? 'Keep: no end'
                : `Keep: ${shortDate(current.expiresAt)} · ${endLabelOf(current.expiresAt, now)}`,
          },
        ];
  return [
    ...keep,
    { value: 'never', label: 'Never' },
    { value: 'day', label: '1 day' },
    { value: 'week', label: '7 days' },
    { value: 'month', label: '30 days' },
  ];
}

function textOf(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function draftReadyOf(draft: FileRequestDraft): boolean {
  return textOf(draft.title) !== null;
}

export function createBodyOf(
  folderItemId: string,
  draft: FileRequestDraft,
  now: number,
): DriveFileRequestCreate | null {
  const title = textOf(draft.title);
  if (title === null) return null;
  return DRIVE_FILE_REQUEST_CREATE.parse({
    folderItemId,
    title,
    message: textOf(draft.message),
    expiresAt: draft.end === 'keep' ? null : expiryOf(draft.end, now),
  });
}

export function changeBodyOf(
  request: DriveFileRequest,
  draft: FileRequestDraft,
  now: number,
): DriveFileRequestChange | null {
  const title = textOf(draft.title);
  if (title === null) return null;
  const message = textOf(draft.message);
  const change = {
    ...(title === request.title ? {} : { title }),
    ...(message === request.message ? {} : { message }),
    ...(draft.end === 'keep' ? {} : { expiresAt: expiryOf(draft.end, now) }),
  };
  return Object.keys(change).length === 0 ? null : DRIVE_FILE_REQUEST_CHANGE.parse(change);
}

export function fileRequestAllowedOf(
  item: Pick<DriveItem, 'kind'>,
  access: DriveAccess,
  owner: boolean,
  settings: Pick<DriveSettings, 'membersMayShare'> | null,
): boolean {
  return item.kind === 'folder' && linkStateOf(access, owner, settings) === 'allowed';
}

export type FileRequestState = 'open' | 'closed' | 'expired';

export function requestStateOf(
  request: Pick<DriveFileRequest, 'closedAt' | 'expiresAt'>,
  now: number,
): FileRequestState {
  if (request.closedAt !== null) return 'closed';
  if (request.expiresAt !== null && Date.parse(request.expiresAt) <= now) return 'expired';
  return 'open';
}

export function stateLineOf(request: DriveFileRequest, now: number): string {
  const state = requestStateOf(request, now);
  if (state === 'closed' && request.closedAt !== null) {
    return `Closed ${shortDate(request.closedAt)}`;
  }
  if (state === 'expired' && request.expiresAt !== null) {
    return `Ended ${shortDate(request.expiresAt)}`;
  }
  return endLabelOf(request.expiresAt, now);
}

export function receivedLineOf(request: Pick<DriveFileRequest, 'uploads' | 'bytes'>): string {
  if (request.uploads === 0) return 'Nothing received yet';
  return joinParts([plural(request.uploads, 'file'), bytes(request.bytes)]);
}

export function bytesShareOf(
  request: Pick<DriveFileRequest, 'bytes'>,
  all: readonly Pick<DriveFileRequest, 'bytes'>[],
): number {
  const largest = all.reduce((most, each) => Math.max(most, each.bytes), 0);
  return largest === 0 ? 0 : request.bytes / largest;
}

export interface FileRequestGroups {
  readonly open: readonly DriveFileRequest[];
  readonly ended: readonly DriveFileRequest[];
}

export function fileRequestGroupsOf(
  rows: readonly DriveFileRequest[],
  viewerId: string | null,
  now: number,
): FileRequestGroups {
  const mine = rows
    .filter((row) => row.createdBy === viewerId)
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  return {
    open: mine.filter((row) => requestStateOf(row, now) === 'open'),
    ended: mine.filter((row) => requestStateOf(row, now) !== 'open'),
  };
}

export function sheetTitleOf(folderName: string, editing: boolean): string {
  return editing ? 'Change file request' : `Request files for ${folderName}`;
}

export const REQUEST_HOW_LINE =
  'People with the link can upload files into this folder. They give their name and cannot see what is inside.';

export const LINK_SHOWN_ONCE_LINE =
  'Copy it now. The Hub keeps only a fingerprint of this link, so it is shown this once.';

export const REQUESTS_LINK_LINE =
  'Each upload link was shown once, when you made the request. To hand out a new link, close the request and make another.';

export function closeQuestionOf(title: string): ConfirmRequest {
  return {
    title: `Close ${title}?`,
    body: 'The link stops taking files. The files it received stay in the folder.',
    confirmLabel: 'Close request',
    cancelLabel: 'Keep open',
    tone: 'destructive',
  };
}
