import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DRIVE_ACCESS_REQUEST_UNIT } from '../../../src/drive/units/access-requests';
import { DRIVE_COMMENT_ADD_UNIT } from '../../../src/drive/units/comments';
import { DRIVE_GRANT_SET_UNIT } from '../../../src/drive/units/grants';
import { DRIVE_TRANSFER_OFFER_UNIT } from '../../../src/drive/units/transfers';
import type { Store } from '../../../src/store/store';
import {
  ROBIN_FILE,
  SECRET,
  TRIP,
  TRIP_FILE,
  openSocial,
  share,
  type Social,
} from './social-fixture';

let social: Social;
let store: Store;

beforeEach(async () => {
  social = await openSocial();
  store = social.opened.store;
});

afterEach(async () => {
  await social.opened.close();
});

const FORBIDDEN: unknown = expect.objectContaining({ code: 'forbidden' });

describe('drive comments with an id the client generated', () => {
  it('keeps the id, returns the same comment on a repeat and refuses another person', () => {
    share(social, TRIP, social.robin, 'view');
    share(social, TRIP, social.kim, 'view');
    const id = randomUUID();
    const add = { id, body: 'Looks good', parentId: null, mentions: [] };
    const first = DRIVE_COMMENT_ADD_UNIT.run(store, {
      actor: social.robin,
      itemId: TRIP_FILE,
      add,
    });
    const again = DRIVE_COMMENT_ADD_UNIT.run(store, {
      actor: social.robin,
      itemId: TRIP_FILE,
      add,
    });

    expect(first.id).toBe(id);
    expect(again).toEqual(first);
    expect(store.driveComments.threads(TRIP_FILE, null, 50).threads).toHaveLength(1);
    expect(() =>
      DRIVE_COMMENT_ADD_UNIT.run(store, { actor: social.kim, itemId: TRIP_FILE, add }),
    ).toThrow(FORBIDDEN);
  });
});

describe('drive shares with an id the client generated', () => {
  it('keeps the id, returns the same share on a repeat and refuses another person', () => {
    const id = randomUUID();
    const grant = {
      id,
      itemId: TRIP,
      profileId: social.robin.profileId,
      role: 'view',
      expiresAt: null,
    } as const;
    const first = DRIVE_GRANT_SET_UNIT.run(store, { actor: social.sam, grant });
    const again = DRIVE_GRANT_SET_UNIT.run(store, { actor: social.sam, grant });

    expect(first.id).toBe(id);
    expect(again).toEqual(first);
    expect(store.driveGrants.forItem(TRIP)).toHaveLength(1);
    const taken = { ...grant, itemId: ROBIN_FILE, profileId: social.kim.profileId };
    expect(() => DRIVE_GRANT_SET_UNIT.run(store, { actor: social.robin, grant: taken })).toThrow(
      FORBIDDEN,
    );
  });
});

describe('ownership offers with an id the client generated', () => {
  it('keeps the id, returns the same offer on a repeat and refuses another person', () => {
    const id = randomUUID();
    const offer = { id, itemId: SECRET, toProfileId: social.robin.profileId };
    const first = DRIVE_TRANSFER_OFFER_UNIT.run(store, { actor: social.sam, offer });
    const again = DRIVE_TRANSFER_OFFER_UNIT.run(store, { actor: social.sam, offer });

    expect(first.id).toBe(id);
    expect(again).toEqual(first);
    expect(store.driveTransfers.involving(social.sam.profileId, null, 50).transfers).toHaveLength(
      1,
    );
    const taken = { id, itemId: ROBIN_FILE, toProfileId: social.sam.profileId };
    expect(() =>
      DRIVE_TRANSFER_OFFER_UNIT.run(store, { actor: social.robin, offer: taken }),
    ).toThrow(FORBIDDEN);
  });
});

describe('access requests with an id the client generated', () => {
  it('fills in the owner, returns the same request on a repeat and refuses another person', () => {
    const id = randomUUID();
    const request = { id, itemId: TRIP_FILE, role: 'view', message: null } as const;
    const first = DRIVE_ACCESS_REQUEST_UNIT.run(store, { actor: social.kim, request });
    const again = DRIVE_ACCESS_REQUEST_UNIT.run(store, { actor: social.kim, request });

    expect(first).toMatchObject({ id, ownerProfileId: social.sam.profileId, state: 'pending' });
    expect(again).toEqual(first);
    expect(store.driveAccessRequests.made(social.kim.profileId, null, 50).requests).toHaveLength(1);
    expect(() => DRIVE_ACCESS_REQUEST_UNIT.run(store, { actor: social.robin, request })).toThrow(
      FORBIDDEN,
    );
  });
});
