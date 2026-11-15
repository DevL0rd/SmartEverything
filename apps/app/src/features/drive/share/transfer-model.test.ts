import { describe, expect, it } from 'vitest';
import { bytes } from '../../../format/number';
import { DRIVE_USAGE_TOTALS, type DriveUsageTotals } from '@smarteverything/domain';
import { MEMBER_ID, OWNER_ID, folderFixture, documentFixture, transferRow } from '../data/fixtures';
import {
  TRANSFER_KEEP_LINE,
  canOfferOf,
  offerBodyOf,
  offerButtonOf,
  offerTitleOf,
  offerWaitingLineOf,
  openOfferOf,
  transferCandidatesOf,
  transferMovesLineOf,
  transferRoomLineOf,
  transferRoomOf,
} from './transfer-model';

const GB = 1024 ** 3;

function usage(profileId: string, live: number, quota: number | null): DriveUsageTotals {
  return DRIVE_USAGE_TOTALS.parse({
    profileId,
    items: 1,
    folders: 0,
    live,
    versions: 0,
    trash: 0,
    quota,
  });
}

describe('transfer confirm', () => {
  it('says whether the item fits in the recipient’s space when their limit is known', () => {
    const rows = [usage(MEMBER_ID, 8 * GB, 10 * GB)];
    expect(transferRoomOf(GB, rows, MEMBER_ID)).toEqual({ kind: 'fits', free: 2 * GB });
    expect(transferRoomOf(5 * GB, rows, MEMBER_ID)).toEqual({ kind: 'short', shortfall: 3 * GB });
    expect(transferRoomOf(GB, [usage(MEMBER_ID, GB, null)], MEMBER_ID)).toEqual({
      kind: 'no-limit',
    });
    expect(transferRoomOf(GB, [usage(OWNER_ID, 0, null)], MEMBER_ID)).toEqual({ kind: 'unknown' });
    expect(transferRoomOf(GB, null, MEMBER_ID)).toEqual({ kind: 'unknown' });
  });

  it('words the space result and refuses to offer what cannot fit', () => {
    expect(transferRoomLineOf({ kind: 'short', shortfall: 3 * GB }, 'Sam')).toBe(
      `Sam needs ${bytes(3 * GB)} more space before they can accept.`,
    );
    expect(transferRoomLineOf({ kind: 'unknown' }, 'Sam')).toBe(
      'Sam’s space is checked when they accept.',
    );
    expect(canOfferOf({ kind: 'short', shortfall: 1 }, true)).toBe(false);
    expect(canOfferOf({ kind: 'unknown' }, true)).toBe(true);
    expect(canOfferOf({ kind: 'fits', free: 1 }, false)).toBe(false);
  });

  it('names what moves, folders with everything in them', () => {
    const folder = folderFixture({ name: 'Projects', bytes: 12 * GB });
    expect(transferMovesLineOf(folder, 'Sam')).toBe(
      `Projects and everything in it (${bytes(12 * GB)}) moves to the top of Sam’s My Drive when they accept.`,
    );
    expect(
      transferMovesLineOf(documentFixture({ name: 'Plan.pdf', bytes: 2 * GB }), 'Sam'),
    ).toMatch(/^Plan\.pdf \(.+\) moves/);
    expect(TRANSFER_KEEP_LINE).toMatch(/^You keep edit access/);
    expect(offerButtonOf('Sam')).toBe('Offer to Sam');
  });

  it('offers to everyone in the home except the viewer', () => {
    const people = [
      { id: OWNER_ID, name: 'Alex' },
      { id: MEMBER_ID, name: 'Sam' },
    ];
    expect(transferCandidatesOf(people, OWNER_ID).map((person) => person.name)).toEqual(['Sam']);
  });

  it('finds the open offer for an item and words it', () => {
    const offer = transferRow();
    const answered = transferRow({
      id: 'a1b2c3d4-0000-4000-8000-000000000999',
      state: 'declined',
      answeredAt: '2026-11-07T11:00:00.000Z',
    });
    expect(openOfferOf([answered, offer], offer.itemId)).toBe(offer);
    expect(openOfferOf([answered], offer.itemId)).toBeNull();
    const now = Date.parse(offer.createdAt) + 2 * 3_600_000;
    expect(offerWaitingLineOf(offer, 'Sam', now)).toBe(
      'Offered to Sam 2 h ago · waiting for them to accept',
    );
  });

  it('words an offer for the person who receives it', () => {
    const offer = transferRow({ itemName: 'Projects', itemKind: 'folder', bytes: GB });
    expect(offerTitleOf(offer, 'Alex')).toBe('Alex offers you Projects');
    expect(offerBodyOf(offer, 'Alex')).toBe(
      `The folder and everything in it (${bytes(GB)}) moves into your My Drive and counts towards your space. Alex keeps edit access.`,
    );
  });
});
