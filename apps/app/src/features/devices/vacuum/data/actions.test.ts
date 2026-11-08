import { VACUUM_CLEANING_COMMANDS, VACUUM_CLEANING_OPTIONS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { cleanRoomsCommand, cleanZonesCommand, cleaningCommand } from './actions';

describe('vacuum commands', () => {
  it('sends the cleaning commands through the shared cleaning capability', () => {
    for (const command of VACUUM_CLEANING_COMMANDS) {
      expect(cleaningCommand(command)).toStrictEqual({ capability: 'cleaning', value: command });
      expect(VACUUM_CLEANING_OPTIONS).toContain(command);
    }
  });

  it('cleans rooms in the order they were chosen with the run options that were given', () => {
    expect(cleanRoomsCommand([5, 3])).toStrictEqual({
      capability: 'raw:clean_rooms',
      value: { rooms: [5, 3] },
    });
    expect(cleanRoomsCommand([3], { repeats: 2, suction: 'turbo' })).toStrictEqual({
      capability: 'raw:clean_rooms',
      value: { rooms: [3], repeats: 2, suction: 'turbo' },
    });
  });

  it('sends nothing for an empty selection', () => {
    expect(cleanRoomsCommand([])).toBeNull();
    expect(cleanZonesCommand([])).toBeNull();
  });

  it('cleans zones in metres and keeps only the rectangle sides', () => {
    const zone = { x1: 0, y1: 0, x2: 2, y2: 3 };
    expect(cleanZonesCommand([{ ...zone }])).toStrictEqual({
      capability: 'raw:clean_zones',
      value: { zones: [zone] },
    });
    expect(cleanZonesCommand([zone], 3)?.value).toStrictEqual({ zones: [zone], repeats: 3 });
  });

  it('does not change the selection it was given', () => {
    const selection = [4, 3];
    const command = cleanRoomsCommand(selection);
    expect(command?.value).toStrictEqual({ rooms: [4, 3] });
    selection.push(9);
    expect(command?.value).toStrictEqual({ rooms: [4, 3] });
  });
});
