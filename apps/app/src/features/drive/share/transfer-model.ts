import type {
  DriveItem,
  DriveTransfer,
  DriveUsageTotals,
  ProfileRow,
} from '@smarteverything/domain';
import { bytes } from '../../../format/number';
import { relative } from '../../../format/time';
import { usedOf } from '../storage/usage-model';

type Person = Pick<ProfileRow, 'id' | 'name'>;

export type TransferRoom =
  | { readonly kind: 'unknown' }
  | { readonly kind: 'no-limit' }
  | { readonly kind: 'fits'; readonly free: number }
  | { readonly kind: 'short'; readonly shortfall: number };

export function transferRoomOf(
  itemBytes: number,
  usage: readonly DriveUsageTotals[] | null,
  recipientId: string,
): TransferRoom {
  const row = usage?.find((each) => each.profileId === recipientId) ?? null;
  if (row === null) return { kind: 'unknown' };
  if (row.quota === null) return { kind: 'no-limit' };
  const free = Math.max(0, row.quota - usedOf(row));
  return free >= itemBytes
    ? { kind: 'fits', free }
    : { kind: 'short', shortfall: itemBytes - free };
}

export function transferRoomLineOf(room: TransferRoom, name: string): string {
  switch (room.kind) {
    case 'unknown':
      return `${name}’s space is checked when they accept.`;
    case 'no-limit':
      return `${name} has no space limit, so it fits.`;
    case 'fits':
      return `${name} has ${bytes(room.free)} free, enough for it.`;
    case 'short':
      return `${name} needs ${bytes(room.shortfall)} more space before they can accept.`;
  }
}

export function transferMovesLineOf(
  item: Pick<DriveItem, 'kind' | 'name' | 'bytes'>,
  name: string,
): string {
  const what = item.kind === 'folder' ? `${item.name} and everything in it` : item.name;
  return `${what} (${bytes(item.bytes)}) moves to the top of ${name}’s My Drive when they accept.`;
}

export const TRANSFER_KEEP_LINE =
  'You keep edit access. Its links, comments, versions and the people it is shared with stay.';

export const TRANSFER_TITLE = 'Transfer ownership';

export function transferCandidatesOf<P extends Person>(
  profiles: readonly P[],
  viewerId: string | null,
): readonly P[] {
  return profiles.filter((profile) => profile.id !== viewerId);
}

export function openOfferOf(
  transfers: readonly DriveTransfer[],
  itemId: string,
): DriveTransfer | null {
  return (
    transfers.find((transfer) => transfer.itemId === itemId && transfer.state === 'offered') ?? null
  );
}

export function offerWaitingLineOf(transfer: DriveTransfer, name: string, now: number): string {
  return `Offered to ${name} ${relative(transfer.createdAt, now)} · waiting for them to accept`;
}

export function offerButtonOf(name: string): string {
  return `Offer to ${name}`;
}

export function canOfferOf(room: TransferRoom, live: boolean): boolean {
  return live && room.kind !== 'short';
}

export function offerBodyOf(transfer: DriveTransfer, fromName: string): string {
  const what = transfer.itemKind === 'folder' ? 'The folder and everything in it' : 'It';
  return `${what} (${bytes(transfer.bytes)}) moves into your My Drive and counts towards your space. ${fromName} keeps edit access.`;
}
