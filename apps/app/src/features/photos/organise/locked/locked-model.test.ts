import { LOCKED_UNLOCK } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import type { MediaTile } from '../../../../components/media-grid/tiles';
import {
  advanceChange,
  advanceSetup,
  CHANGE_START,
  landingAfter,
  lockedNeighbours,
  changeStepNumber,
  changeValue,
  withChangeValue,
  msUntil,
  pinOf,
  pinReady,
  SETUP_START,
  setupStepNumber,
} from './locked-model';

describe('locked folder setup', () => {
  it('keeps digits only and asks for at least four, like the hub', () => {
    expect(pinOf('12a3 4')).toBe('1234');
    expect(pinReady('123')).toBe(false);
    expect(pinReady('1234')).toBe(true);
    expect(LOCKED_UNLOCK.safeParse({ pin: '123' }).success).toBe(false);
    expect(LOCKED_UNLOCK.safeParse({ pin: '1234' }).success).toBe(true);
  });

  it('asks for the PIN twice and saves when both match', () => {
    const short = advanceSetup({ kind: 'choose', pin: '12' }, false);
    expect(short.error).not.toBeNull();
    expect(short.save).toBeNull();
    const chosen = advanceSetup({ kind: 'choose', pin: '2468' }, false);
    expect(chosen.step).toEqual({ kind: 'repeat', pin: '2468', again: '' });
    const saved = advanceSetup({ kind: 'repeat', pin: '2468', again: '2468' }, false);
    expect(saved.save).toBe('2468');
  });

  it('starts over when the second PIN differs', () => {
    const missed = advanceSetup({ kind: 'repeat', pin: '2468', again: '2469' }, false);
    expect(missed.step).toEqual(SETUP_START);
    expect(missed.error).toMatch(/match/u);
    expect(missed.save).toBeNull();
  });

  it('offers the fingerprint step only where the phone has one', () => {
    const offered = advanceSetup({ kind: 'repeat', pin: '2468', again: '2468' }, true);
    expect(offered.step).toEqual({ kind: 'fingerprint', pin: '2468' });
    expect(offered.save).toBeNull();
    expect(setupStepNumber(offered.step)).toBe(3);
    expect(advanceSetup(offered.step, true).save).toBe('2468');
  });

  it('counts down to the hub expiry', () => {
    expect(msUntil('2024-01-01T00:01:00.000Z', Date.parse('2024-01-01T00:00:00.000Z'))).toBe(
      60_000,
    );
    expect(msUntil('2024-01-01T00:00:00.000Z', Date.parse('2024-01-01T00:05:00.000Z'))).toBe(0);
  });
});

describe('locked folder PIN change', () => {
  it('asks for the current PIN, a new one and the new one again', () => {
    expect(advanceChange(CHANGE_START).error).toBe('Use at least four digits.');
    const chosen = advanceChange(withChangeValue(CHANGE_START, '1234')).step;
    expect(chosen).toEqual({ kind: 'choose', current: '1234', pin: '' });
    expect(changeStepNumber(chosen)).toBe(2);
    expect(advanceChange(withChangeValue(chosen, '1234')).error).toBe(
      'Choose a PIN that differs from the current one.',
    );
    const repeat = advanceChange(withChangeValue(chosen, '98765')).step;
    expect(repeat).toEqual({ kind: 'repeat', current: '1234', pin: '98765', again: '' });
    expect(changeValue(withChangeValue(repeat, '98765'))).toBe('98765');
    expect(advanceChange(withChangeValue(repeat, '98765')).save).toEqual({
      currentPin: '1234',
      pin: '98765',
    });
  });

  it('starts the new PIN again when the two entries differ', () => {
    const repeat = withChangeValue(
      { kind: 'repeat', current: '1234', pin: '98765', again: '' },
      '98766',
    );
    const advanced = advanceChange(repeat);
    expect(advanced.step).toEqual({ kind: 'choose', current: '1234', pin: '' });
    expect(advanced.error).toBe('The PINs did not match. Choose the new PIN again.');
    expect(advanced.save).toBeNull();
    expect(changeStepNumber(CHANGE_START)).toBe(1);
    expect(changeStepNumber(repeat)).toBe(3);
  });
});

describe('locked folder viewer', () => {
  const tile = (id: string): MediaTile => ({
    id,
    rev: 1,
    aspect: 1,
    takenAt: 0,
    offsetMin: null,
    durationMs: null,
    thumbhash: null,
    flags: 0,
    local: false,
  });
  const tiles = [tile('a'), tile('b'), tile('c')];

  it('steps between the loaded photos and counts the place', () => {
    expect(lockedNeighbours(tiles, 'b')).toEqual({
      current: tiles[1],
      previous: tiles[0],
      next: tiles[2],
      position: 2,
      total: 3,
    });
    expect(lockedNeighbours(tiles, 'a')?.previous).toBeNull();
    expect(lockedNeighbours(tiles, 'z')).toBeNull();
  });

  it('lands on the next photo after one leaves, then the previous, then closes', () => {
    expect(landingAfter(tiles, 'b')).toBe('c');
    expect(landingAfter(tiles, 'c')).toBe('b');
    expect(landingAfter([tile('a')], 'a')).toBeNull();
  });
});
