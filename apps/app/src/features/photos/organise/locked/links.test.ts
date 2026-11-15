import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DriveItemLink } from '@smarteverything/domain';

const readLockedLinks = vi.hoisted(() =>
  vi.fn<(token: string, itemIds: readonly string[]) => Promise<readonly DriveItemLink[]>>(),
);

vi.mock('../api', () => ({
  readLockedLinks,
  lockLockedFolder: (): Promise<void> => Promise.resolve(),
}));

const { lockedLinks } = await import('./links');
const { forgetLockedSession, openLockedSession } = await import('./session');

const ITEM = 'a1b2c3d4-0000-4000-8000-000000000011';

function link(token: string): DriveItemLink {
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  return {
    itemId: ITEM,
    rev: 1,
    file: { url: `/media/f-${token}`, expiresAt },
    download: null,
    icon: null,
    thumb: { url: `/media/t-${token}`, expiresAt },
    preview: null,
    playable: null,
  };
}

beforeEach(() => {
  forgetLockedSession();
  readLockedLinks.mockReset();
  readLockedLinks.mockImplementation((token) => Promise.resolve([link(token)]));
});

describe('Locked folder links', () => {
  it('asks with the open session token and serves the thumb', async () => {
    openLockedSession({ token: 'one', expiresAt: new Date(Date.now() + 600_000).toISOString() });
    await expect(lockedLinks.resolve(ITEM, 1, 'thumb')).resolves.toBe('/media/t-one');
    expect(readLockedLinks).toHaveBeenCalledWith('one', [ITEM]);
  });

  it('asks for nothing while the folder is locked', async () => {
    await expect(lockedLinks.resolve(ITEM, 1, 'thumb')).rejects.toMatchObject({
      code: 'forbidden',
    });
    expect(readLockedLinks).not.toHaveBeenCalled();
  });

  it('drops the links of a closed session', async () => {
    openLockedSession({ token: 'one', expiresAt: new Date(Date.now() + 600_000).toISOString() });
    await lockedLinks.resolve(ITEM, 1, 'thumb');
    forgetLockedSession();
    openLockedSession({ token: 'two', expiresAt: new Date(Date.now() + 600_000).toISOString() });
    await expect(lockedLinks.resolve(ITEM, 1, 'thumb')).resolves.toBe('/media/t-two');
    expect(readLockedLinks).toHaveBeenLastCalledWith('two', [ITEM]);
  });
});
