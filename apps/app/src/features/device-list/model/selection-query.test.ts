import { describe, expect, it } from 'vitest';
import { NO_SELECTION } from '../../home-map';
import { ANY, NO_ROOM, type DeviceQuery } from './device-filter';
import { selectionFromQuery, withSelection, type SelectionQuery } from './selection-query';

interface Query extends SelectionQuery {
  readonly text: string;
  readonly kind: string;
  readonly offline: boolean;
}

const BASE: Query = { text: 'lamp', room: ANY, kind: 'Light', offline: true };

describe('selectionFromQuery', () => {
  it('reads the room, the device or nothing', () => {
    expect(selectionFromQuery({ room: 'kitchen' })).toStrictEqual({
      kind: 'room',
      roomId: 'kitchen',
    });
    expect(selectionFromQuery({ room: ANY, device: 'lamp' })).toStrictEqual({
      kind: 'device',
      deviceId: 'lamp',
    });
    expect(selectionFromQuery({ room: ANY })).toStrictEqual(NO_SELECTION);
  });

  it('does not treat the any and no-room filters as a map room', () => {
    expect(selectionFromQuery({ room: NO_ROOM })).toStrictEqual(NO_SELECTION);
    expect(selectionFromQuery({ room: ANY, device: '' })).toStrictEqual(NO_SELECTION);
  });

  it('accepts the existing device query', () => {
    const query: DeviceQuery = { text: '', room: 'kitchen', kind: ANY, offline: false };
    expect(selectionFromQuery(query)).toStrictEqual({ kind: 'room', roomId: 'kitchen' });
  });
});

describe('withSelection', () => {
  it('a room sets query.room and clears the device', () => {
    const next = withSelection({ ...BASE, device: 'lamp' }, { kind: 'room', roomId: 'kitchen' });
    expect(next).toStrictEqual({ ...BASE, room: 'kitchen', device: undefined });
  });

  it('a device sets query.device and clears the room', () => {
    const next = withSelection({ ...BASE, room: 'kitchen' }, { kind: 'device', deviceId: 'lamp' });
    expect(next).toStrictEqual({ ...BASE, room: ANY, device: 'lamp' });
  });

  it('none clears both and keeps the other filters', () => {
    const next = withSelection({ ...BASE, room: 'kitchen', device: 'lamp' }, NO_SELECTION);
    expect(next).toStrictEqual({ ...BASE, room: ANY, device: undefined });
  });

  it('round trips through selectionFromQuery', () => {
    for (const selection of [
      NO_SELECTION,
      { kind: 'room', roomId: 'kitchen' },
      { kind: 'device', deviceId: 'lamp' },
    ] as const) {
      expect(selectionFromQuery(withSelection(BASE, selection))).toStrictEqual(selection);
    }
  });
});
