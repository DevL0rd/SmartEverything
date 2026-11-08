import { describe, expect, it } from 'vitest';
import { NO_SELECTION, sameSelection, selectionOf, selectionParams } from './selection';

describe('selectionOf', () => {
  it('reads a room, a device or nothing from the url params', () => {
    expect(selectionOf({ room: 'kitchen' })).toStrictEqual({ kind: 'room', roomId: 'kitchen' });
    expect(selectionOf({ device: 'lamp' })).toStrictEqual({ kind: 'device', deviceId: 'lamp' });
    expect(selectionOf({})).toStrictEqual(NO_SELECTION);
  });

  it('treats empty params as no selection', () => {
    expect(selectionOf({ room: '', device: '' })).toStrictEqual(NO_SELECTION);
    expect(selectionOf({ room: 'kitchen', device: '' })).toStrictEqual({
      kind: 'room',
      roomId: 'kitchen',
    });
  });

  it('lets a device win over a room, since a device selection is exclusive', () => {
    expect(selectionOf({ room: 'kitchen', device: 'lamp' })).toStrictEqual({
      kind: 'device',
      deviceId: 'lamp',
    });
  });
});

describe('selectionParams', () => {
  it('round trips every selection through the url params', () => {
    for (const selection of [
      NO_SELECTION,
      { kind: 'room', roomId: 'kitchen' },
      { kind: 'device', deviceId: 'lamp' },
    ] as const) {
      expect(selectionOf(selectionParams(selection))).toStrictEqual(selection);
    }
  });

  it('writes only the key of the selected thing', () => {
    expect(selectionParams(NO_SELECTION)).toStrictEqual({});
    expect(selectionParams({ kind: 'room', roomId: 'kitchen' })).toStrictEqual({
      room: 'kitchen',
    });
    expect(selectionParams({ kind: 'device', deviceId: 'lamp' })).toStrictEqual({
      device: 'lamp',
    });
  });
});

describe('sameSelection', () => {
  it('compares kind and id', () => {
    const room = { kind: 'room', roomId: 'a' } as const;
    const device = { kind: 'device', deviceId: 'a' } as const;
    expect(sameSelection(room, { kind: 'room', roomId: 'a' })).toBe(true);
    expect(sameSelection(room, { kind: 'room', roomId: 'b' })).toBe(false);
    expect(sameSelection(room, device)).toBe(false);
    expect(sameSelection(device, { kind: 'device', deviceId: 'a' })).toBe(true);
    expect(sameSelection(NO_SELECTION, NO_SELECTION)).toBe(true);
    expect(sameSelection(NO_SELECTION, room)).toBe(false);
    expect(sameSelection(device, NO_SELECTION)).toBe(false);
  });
});
