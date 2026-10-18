import type { TableRow } from '@smarteverything/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const placeRoom = vi.hoisted(() => vi.fn());

vi.mock('../../../api/settings', () => ({
  createRoom: vi.fn(),
  placeRoom,
  renameRoom: vi.fn(),
}));

import { moveRoom, reorderRooms } from './rooms';

function room(id: string, position: number): TableRow<'rooms'> {
  return { id, name: id, position };
}

const ROOMS = [room('a', 0), room('b', 1), room('c', 2)];

beforeEach(() => {
  placeRoom.mockReset().mockResolvedValue(undefined);
});

describe('reorderRooms', () => {
  it('sends only the rooms that moved', async () => {
    await reorderRooms(ROOMS, ['a', 'c', 'b']);
    expect(placeRoom.mock.calls).toEqual([
      ['c', 1],
      ['b', 2],
    ]);
  });

  it('sends one request at a time and stops at the first failure', async () => {
    placeRoom.mockRejectedValueOnce(new Error('offline'));
    await expect(reorderRooms(ROOMS, ['c', 'b', 'a'])).rejects.toThrow('offline');
    expect(placeRoom).toHaveBeenCalledTimes(1);
  });
});

describe('moveRoom', () => {
  it('moving a room down sends only the shifted positions', async () => {
    await moveRoom(ROOMS, 'a', 1);
    expect(placeRoom.mock.calls).toEqual([
      ['b', 0],
      ['a', 1],
    ]);
  });

  it('moving a room up sends only the shifted positions', async () => {
    await moveRoom(ROOMS, 'c', -1);
    expect(placeRoom.mock.calls).toEqual([
      ['c', 1],
      ['b', 2],
    ]);
  });

  it('sends nothing for the first room up, the last room down or an unknown id', async () => {
    await moveRoom(ROOMS, 'a', -1);
    await moveRoom(ROOMS, 'c', 1);
    await moveRoom(ROOMS, 'missing', 1);
    expect(placeRoom).not.toHaveBeenCalled();
  });
});
