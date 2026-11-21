import type { TableRow } from '@smarteverything/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const placeRoom = vi.hoisted(() => vi.fn());

vi.mock('../../../api/settings', () => ({
  createRoom: vi.fn(),
  placeRoom,
  removeRoom: vi.fn(),
  renameRoom: vi.fn(),
}));

import { EntityStore } from '../../../store/entity-store';
import { liveRowEdit } from '../../../store/optimistic';
import { moveRoom, reorderRooms } from './rooms';

function room(id: string, position: number): TableRow<'rooms'> {
  return { id, name: id, position };
}

const ROOMS = [room('a', 0), room('b', 1), room('c', 2)];

let store = new EntityStore();

function positions(): Readonly<Record<string, number | undefined>> {
  const rows = store.get().tables.rooms.byId;
  return { a: rows['a']?.position, b: rows['b']?.position, c: rows['c']?.position };
}

beforeEach(() => {
  placeRoom.mockReset().mockResolvedValue(undefined);
  store = new EntityStore();
  for (const row of ROOMS) store.update(liveRowEdit('rooms', row.id, null, row).apply);
});

describe('reorderRooms', () => {
  it('sends only the rooms that moved', async () => {
    await reorderRooms(store, ROOMS, ['a', 'c', 'b']);
    expect(placeRoom.mock.calls).toEqual([
      ['c', 1],
      ['b', 2],
    ]);
  });

  it('sends one request at a time and stops at the first failure', async () => {
    placeRoom.mockRejectedValueOnce(new Error('offline'));
    await expect(reorderRooms(store, ROOMS, ['c', 'b', 'a'])).rejects.toThrow('offline');
    expect(placeRoom).toHaveBeenCalledTimes(1);
  });

  it('shows the new order before the hub answers', () => {
    placeRoom.mockReturnValue(new Promise(() => undefined));
    void reorderRooms(store, ROOMS, ['c', 'b', 'a']);
    expect(positions()).toEqual({ a: 2, b: 1, c: 0 });
  });

  it('puts back only the moves the hub did not take', async () => {
    placeRoom.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('offline'));
    await expect(reorderRooms(store, ROOMS, ['b', 'c', 'a'])).rejects.toThrow('offline');
    expect(positions()).toEqual({ a: 0, b: 0, c: 2 });
  });
});

describe('moveRoom', () => {
  it('moving a room down sends only the shifted positions', async () => {
    await moveRoom(store, ROOMS, 'a', 1);
    expect(placeRoom.mock.calls).toEqual([
      ['b', 0],
      ['a', 1],
    ]);
  });

  it('moving a room up sends only the shifted positions', async () => {
    await moveRoom(store, ROOMS, 'c', -1);
    expect(placeRoom.mock.calls).toEqual([
      ['c', 1],
      ['b', 2],
    ]);
  });

  it('sends nothing for the first room up, the last room down or an unknown id', async () => {
    await moveRoom(store, ROOMS, 'a', -1);
    await moveRoom(store, ROOMS, 'c', 1);
    await moveRoom(store, ROOMS, 'missing', 1);
    expect(placeRoom).not.toHaveBeenCalled();
  });
});
