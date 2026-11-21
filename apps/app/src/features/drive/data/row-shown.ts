import type {
  DriveAccessAnswer,
  DriveAccessRequestCreate,
  DriveGrantRole,
  DriveGrant,
  DriveGrantSet,
  DriveTransfer,
  DriveNotificationsRead,
  DrivePlacementSet,
  DriveTransferOffer,
} from '@smarteverything/domain';
import { liveRowEdit, type Edit } from '../../../store/optimistic';
import { rowsOf, type RowOf, type StoreState } from '../../../store/state';

export interface DriveShown<R = unknown> {
  readonly edits: readonly Edit[];
  readonly settle: ((state: StoreState, answer: R) => StoreState) | null;
}

export const NOTHING_SHOWN: DriveShown = { edits: [], settle: null };

function shownEdits(edits: readonly Edit[]): DriveShown {
  return { edits, settle: null };
}

export type WithClientId<B> = B & { readonly id: string };

type Created = 'drive_grants' | 'drive_transfers';

function shownCreated<T extends Created>(table: T, row: RowOf<T>): DriveShown<RowOf<T>> {
  return {
    edits: [liveRowEdit(table, row.id, null, row)],
    settle: (state, answer): StoreState => {
      const saved = liveRowEdit(table, answer.id, null, answer).apply(state);
      return answer.id === row.id ? saved : liveRowEdit(table, row.id, row, null).apply(saved);
    },
  };
}

function viewerOf(state: StoreState): string | null {
  return state.session === null ? null : state.session.client.profile_id;
}

function changed<T extends 'drive_grants' | 'drive_transfers' | 'drive_access_requests'>(
  table: T,
  row: RowOf<T> | undefined,
  next: (row: RowOf<T>) => RowOf<T> | null,
): DriveShown {
  if (row === undefined) return NOTHING_SHOWN;
  return shownEdits([liveRowEdit(table, row.id, row, next(row))]);
}

export function grantSetShown(
  state: StoreState,
  body: WithClientId<DriveGrantSet>,
  now: string,
): DriveShown<DriveGrant> {
  const existing = rowsOf(state.tables.drive_grants).find(
    (grant) => grant.itemId === body.itemId && grant.profileId === body.profileId,
  );
  if (existing !== undefined) {
    return changed('drive_grants', existing, (grant) => ({
      ...grant,
      role: body.role,
      expiresAt: body.expiresAt,
    }));
  }
  const viewer = viewerOf(state);
  if (viewer === null) return NOTHING_SHOWN;
  return shownCreated('drive_grants', {
    ...body,
    grantedBy: viewer,
    createdAt: now,
  });
}

export function grantRemoveShown(state: StoreState, grantId: string): DriveShown {
  return changed('drive_grants', state.tables.drive_grants.byId[grantId], () => null);
}

export interface SentAccessRequest {
  readonly id: string;
  readonly itemId: string;
  readonly role: DriveGrantRole;
  readonly message: string | null;
  readonly ownerProfileId: string | null;
  readonly createdAt: string;
}

export function accessRequestShown(
  body: WithClientId<DriveAccessRequestCreate>,
  now: string,
): SentAccessRequest {
  return {
    id: body.id,
    itemId: body.itemId,
    role: body.role,
    message: body.message,
    ownerProfileId: null,
    createdAt: now,
  };
}

export function accessAnswerShown(
  state: StoreState,
  requestId: string,
  answer: DriveAccessAnswer,
  now: string,
): DriveShown {
  const viewer = viewerOf(state);
  if (viewer === null) return NOTHING_SHOWN;
  return changed(
    'drive_access_requests',
    state.tables.drive_access_requests.byId[requestId],
    (row) =>
      answer.decision === 'approve'
        ? {
            ...row,
            state: 'approved',
            role: answer.role,
            expiresAt: answer.expiresAt,
            answeredBy: viewer,
            answeredAt: now,
          }
        : { ...row, state: 'declined', answeredBy: viewer, answeredAt: now },
  );
}

export function fileRequestCloseShown(
  state: StoreState,
  requestId: string,
  now: string,
): DriveShown {
  const row = state.tables.drive_file_requests.byId[requestId];
  if (row === undefined) return NOTHING_SHOWN;
  return shownEdits([liveRowEdit('drive_file_requests', row.id, row, { ...row, closedAt: now })]);
}

export function notificationsReadShown(
  state: StoreState,
  body: DriveNotificationsRead,
  now: string,
): DriveShown {
  const ids = 'ids' in body ? new Set(body.ids) : null;
  const unread = rowsOf(state.tables.drive_notifications).filter(
    (row) => row.readAt === null && (ids === null || ids.has(row.id)),
  );
  return shownEdits(
    unread.map((row) => liveRowEdit('drive_notifications', row.id, row, { ...row, readAt: now })),
  );
}

export interface OfferedItem {
  readonly id: string;
  readonly name: string;
  readonly kind: RowOf<'drive_transfers'>['itemKind'];
  readonly bytes: number;
}

export function transferOfferShown(
  state: StoreState,
  item: OfferedItem,
  body: WithClientId<DriveTransferOffer>,
  now: string,
): DriveShown<DriveTransfer> {
  const viewer = viewerOf(state);
  if (viewer === null || item.id !== body.itemId) return NOTHING_SHOWN;
  return shownCreated('drive_transfers', {
    id: body.id,
    itemId: item.id,
    itemName: item.name,
    itemKind: item.kind,
    bytes: item.bytes,
    fromProfileId: viewer,
    toProfileId: body.toProfileId,
    state: 'offered',
    createdAt: now,
    answeredAt: null,
  });
}

export function transferAnswerShown(
  state: StoreState,
  transferId: string,
  accept: boolean,
  now: string,
): DriveShown {
  return changed('drive_transfers', state.tables.drive_transfers.byId[transferId], (row) => ({
    ...row,
    state: accept ? 'accepted' : 'declined',
    answeredAt: now,
  }));
}

export function transferCancelShown(
  state: StoreState,
  transferId: string,
  now: string,
): DriveShown {
  return changed('drive_transfers', state.tables.drive_transfers.byId[transferId], (row) => ({
    ...row,
    state: 'cancelled',
    answeredAt: now,
  }));
}

export function placementSetShown(state: StoreState, body: DrivePlacementSet): Edit | null {
  const row = rowsOf(state.tables.drive_placements).find(
    (placement) =>
      placement.mode === 'synced' &&
      placement.deviceId === body.deviceId &&
      placement.rootId === body.rootId &&
      placement.folderItemId === body.folderItemId,
  );
  if (row === undefined) return null;
  return liveRowEdit('drive_placements', row.id, row, {
    ...row,
    localPath: body.localPath,
    enabled: body.enabled,
    excluded: body.excluded,
    ignorePatterns: body.ignorePatterns,
    conflictCopies: body.conflictCopies,
  });
}

export function placementRemoveShown(state: StoreState, placementId: string): Edit | null {
  const row = state.tables.drive_placements.byId[placementId];
  return row === undefined ? null : liveRowEdit('drive_placements', row.id, row, null);
}

export function mountShown(state: StoreState, deviceId: string, enabled: boolean): Edit | null {
  const row = rowsOf(state.tables.drive_placements).find(
    (placement) => placement.deviceId === deviceId && placement.mode === 'mounted',
  );
  return row === undefined
    ? null
    : liveRowEdit('drive_placements', row.id, row, { ...row, enabled });
}
