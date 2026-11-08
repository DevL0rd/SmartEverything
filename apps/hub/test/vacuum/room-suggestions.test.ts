import { describe, expect, it } from 'vitest';
import { nameScore, suggestHomeRooms } from '../../src/vacuum/room-suggestions';

const home = (id: string, name: string): { readonly id: string; readonly name: string } => ({
  id,
  name,
});

const HOME = [
  home('a', 'Living room'),
  home('b', 'Kitchen'),
  home('c', 'Hallway'),
  home('d', 'Master bedroom'),
  home('e', 'Office'),
];

describe('the room name suggestions', () => {
  it('rank the same name over the same words over a word prefix', () => {
    expect(nameScore('Kitchen', 'kitchen')).toBe(3);
    expect(nameScore('Bedroom', 'Master bedroom')).toBe(2);
    expect(nameScore('Hall', 'Hallway')).toBe(1);
    expect(nameScore('Living room', 'Guest room')).toBe(0);
    expect(nameScore('Room1', 'Office')).toBe(0);
    expect(nameScore('', 'Office')).toBe(0);
  });

  it('suggest one home room per map room and each home room once', () => {
    const suggested = suggestHomeRooms(
      [
        { id: 1, name: 'Living room' },
        { id: 2, name: 'Kitchen' },
        { id: 3, name: 'Hall' },
        { id: 4, name: 'Bedroom' },
        { id: 5, name: 'Study' },
      ],
      HOME,
    );
    expect([...suggested].map(([id, room]) => [id, room.name])).toStrictEqual([
      [1, 'Living room'],
      [2, 'Kitchen'],
      [4, 'Master bedroom'],
      [3, 'Hallway'],
    ]);
  });

  it('suggest nothing when two home rooms match a map room equally well', () => {
    const suggested = suggestHomeRooms(
      [{ id: 1, name: 'Bedroom' }],
      [home('a', 'Master bedroom'), home('b', 'Guest bedroom')],
    );
    expect(suggested.size).toBe(0);
  });

  it('suggest nothing when two map rooms match one home room equally well', () => {
    const suggested = suggestHomeRooms(
      [
        { id: 1, name: 'Bedroom' },
        { id: 2, name: 'Bedroom' },
      ],
      [home('a', 'Bedroom')],
    );
    expect(suggested.size).toBe(0);
  });

  it('give a contested home room to the better match only', () => {
    const suggested = suggestHomeRooms(
      [
        { id: 1, name: 'Kitchen' },
        { id: 2, name: 'Kitchen corner' },
      ],
      [home('a', 'Kitchen')],
    );
    expect([...suggested].map(([id, room]) => [id, room.id])).toStrictEqual([[1, 'a']]);
  });
});
