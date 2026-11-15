import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { accessFilter } from '../../../src/drive/access';
import { LibraryReader } from '../../../src/photos/library';
import { UNLOCK_LIFETIME_MS, LockedService } from '../../../src/photos/organise/locked';
import { OrganisePages } from '../../../src/photos/organise/pages';
import { libraryVisible, photoVisible } from '../../../src/photos/membership';
import { openKit, type Kit } from './fixture';

let kit: Kit;
let service: LockedService;

beforeEach(async () => {
  kit = await openKit();
  service = new LockedService({ locked: kit.store.photoLocked, now: (): Date => kit.time.current });
});
afterEach(async () => {
  await kit.test.close();
});

const ALICE = (): string => kit.alice.profileId;

function attempt(profile: string, client: string, token: string | undefined): () => void {
  return () => {
    service.require(profile, client, token);
  };
}

describe('the Locked folder PIN', () => {
  it('starts unconfigured and is set once without a current PIN', async () => {
    expect(service.state(ALICE())).toEqual({ configured: false });
    await service.setPin(ALICE(), { pin: '2468', currentPin: null });
    expect(service.state(ALICE())).toEqual({ configured: true });
    expect(kit.store.photoLocked.pin(ALICE())?.hash).not.toContain('2468');
  });

  it('refuses a current PIN before one is set and a missing one after', async () => {
    await expect(
      service.setPin(ALICE(), { pin: '2468', currentPin: '1111' }),
    ).rejects.toMatchObject({
      code: 'invalid_request',
    });
    await service.setPin(ALICE(), { pin: '2468', currentPin: null });
    await expect(service.setPin(ALICE(), { pin: '1357', currentPin: null })).rejects.toMatchObject({
      code: 'invalid_request',
    });
  });

  it('changes the PIN only with the current one and ends every open session', async () => {
    await service.setPin(ALICE(), { pin: '2468', currentPin: null });
    const open = await service.unlock(ALICE(), kit.phone, '2468');
    await expect(
      service.setPin(ALICE(), { pin: '1357', currentPin: '0000' }),
    ).rejects.toMatchObject({
      code: 'forbidden',
    });
    service.require(ALICE(), kit.phone, open.token);
    await service.setPin(ALICE(), { pin: '1357', currentPin: '2468' });
    expect(attempt(ALICE(), kit.phone, open.token)).toThrow(
      expect.objectContaining({ code: 'forbidden' }),
    );
    await expect(service.unlock(ALICE(), kit.phone, '2468')).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(service.unlock(ALICE(), kit.phone, '1357')).resolves.toMatchObject({});
  });

  it('refuses a wrong PIN and stops guessing after five wrong tries', async () => {
    await service.setPin(ALICE(), { pin: '2468', currentPin: null });
    for (let tries = 0; tries < 5; tries += 1) {
      await expect(service.unlock(ALICE(), kit.phone, '9999')).rejects.toMatchObject({
        code: 'forbidden',
      });
    }
    await expect(service.unlock(ALICE(), kit.phone, '2468')).rejects.toMatchObject({
      code: 'rate_limited',
      retryAfterSeconds: 600,
      message: 'Too many wrong attempts. Try again in 10 min.',
    });
    kit.time.current = new Date(kit.time.current.getTime() + 11 * 60_000);
    await expect(service.unlock(ALICE(), kit.phone, '2468')).resolves.toMatchObject({});
  });

  it('refuses to unlock before a PIN exists', async () => {
    await expect(service.unlock(ALICE(), kit.phone, '2468')).rejects.toMatchObject({
      code: 'invalid_request',
    });
  });
});

describe('unlock tokens', () => {
  beforeEach(async () => {
    await service.setPin(ALICE(), { pin: '2468', currentPin: null });
  });

  it('are bound to the person and the client that unlocked', async () => {
    const open = await service.unlock(ALICE(), kit.phone, '2468');
    service.require(ALICE(), kit.phone, open.token);
    for (const [profile, client] of [
      [ALICE(), kit.tablet],
      [kit.bob.profileId, kit.phone],
    ] as const) {
      expect(attempt(profile, client, open.token)).toThrow(
        expect.objectContaining({ code: 'forbidden' }),
      );
    }
    expect(attempt(ALICE(), kit.phone, undefined)).toThrow(
      expect.objectContaining({ code: 'forbidden' }),
    );
    expect(attempt(ALICE(), kit.phone, 'not-a-token')).toThrow(
      expect.objectContaining({ code: 'forbidden' }),
    );
  });

  it('expire after their lifetime', async () => {
    const open = await service.unlock(ALICE(), kit.phone, '2468');
    expect(open.expiresAt).toBe(
      new Date(kit.time.current.getTime() + UNLOCK_LIFETIME_MS).toISOString(),
    );
    kit.time.current = new Date(kit.time.current.getTime() + UNLOCK_LIFETIME_MS + 1);
    expect(attempt(ALICE(), kit.phone, open.token)).toThrow(
      expect.objectContaining({ code: 'forbidden' }),
    );
  });

  it('end when the client locks, and a second unlock replaces the first token', async () => {
    const first = await service.unlock(ALICE(), kit.phone, '2468');
    const second = await service.unlock(ALICE(), kit.phone, '2468');
    expect(attempt(ALICE(), kit.phone, first.token)).toThrow();
    service.require(ALICE(), kit.phone, second.token);
    service.lock(ALICE(), kit.phone);
    expect(attempt(ALICE(), kit.phone, second.token)).toThrow();
  });
});

describe('Locked folder pages and visibility', () => {
  it('lists only the caller own locked photos and keeps them out of every other reader', () => {
    const open = kit.seed({ n: 1, takenAt: '2026-03-01T10:00:00.000Z', root: kit.aliceRoot });
    const locked = kit.seed({
      n: 2,
      takenAt: '2026-03-02T10:00:00.000Z',
      root: kit.aliceRoot,
      name: '.locked/2.jpg',
    });
    const other = kit.seed({
      n: 3,
      takenAt: '2026-03-03T10:00:00.000Z',
      root: kit.bobRoot,
      name: '.locked/3.jpg',
    });
    const pages = new OrganisePages(kit.store.context, () => 'UTC');
    expect(pages.lockedBuckets(kit.alice, { filter: 'all' })).toEqual([
      { month: '2026-03', count: 1 },
    ]);
    expect(pages.lockedPage(kit.alice, '2026-03', { filter: 'all' }).ids).toEqual([locked]);
    expect(pages.lockedPage(kit.bob, '2026-03', { filter: 'all' }).ids).toEqual([other]);
    expect(kit.shown(photoVisible(kit.alice))).toEqual([open]);
    expect(kit.shown(libraryVisible(kit.alice))).toEqual([open]);
    expect(kit.shown(accessFilter(kit.alice))).toEqual([open]);
    const library = new LibraryReader(kit.store.context, () => 'UTC');
    expect(library.page(kit.alice, '2026-03', { filter: 'all' }).ids).toEqual([open]);
    expect(library.buckets(kit.alice, { filter: 'all' })).toEqual([{ month: '2026-03', count: 1 }]);
  });
});
