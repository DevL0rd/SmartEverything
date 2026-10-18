import { describe, expect, it } from 'vitest';
import {
  EMPTY_IR_REMOTE_STATE,
  IR_REMOTE_CHANGE,
  IR_REMOTE_STATE,
  IR_SPEED_STEPS,
  IR_TEMP_RANGE,
  afterIrSend,
  irRecentSends,
  withIrChange,
} from '../src';

const NOW = '2026-10-18T12:00:00.000Z';

describe('afterIrSend', () => {
  it('turns an unknown remote on with the first power key and off with the second', () => {
    const on = afterIrSend(EMPTY_IR_REMOTE_STATE, 'Power', [], NOW);
    expect(on.on).toBe(true);
    expect(afterIrSend(on, 'Power', [], NOW).on).toBe(false);
  });

  it('records which key was sent and when, and claims nothing it was not told', () => {
    const state = afterIrSend(EMPTY_IR_REMOTE_STATE, 'Swing', [], NOW);
    expect(state).toEqual({
      ...EMPTY_IR_REMOTE_STATE,
      sentKey: 'Swing',
      sentAt: NOW,
      recent: [NOW],
    });
  });

  it('counts temperature presses from the start value and stays inside the range', () => {
    let state = afterIrSend(EMPTY_IR_REMOTE_STATE, 'Temp down', [], NOW);
    expect(state.temp).toBe(23);
    for (let press = 0; press < 40; press += 1) {
      state = afterIrSend(state, 'Temp up', [], NOW);
    }
    expect(state.temp).toBe(IR_TEMP_RANGE.max);
    for (let press = 0; press < 40; press += 1) {
      state = afterIrSend(state, 'Temp down', [], NOW);
    }
    expect(state.temp).toBe(IR_TEMP_RANGE.min);
    expect(afterIrSend(EMPTY_IR_REMOTE_STATE, 'Temp up', [], NOW).temp).toBe(25);
  });

  it('steps fan speed from nothing and wraps the single speed key', () => {
    const first = afterIrSend(EMPTY_IR_REMOTE_STATE, 'Speed up', [], NOW);
    expect(first.speed).toBe(1);
    expect(afterIrSend(first, 'Speed up', [], NOW).speed).toBe(2);
    expect(afterIrSend({ ...first, speed: IR_SPEED_STEPS }, 'Speed up', [], NOW).speed).toBe(
      IR_SPEED_STEPS,
    );
    expect(afterIrSend({ ...first, speed: IR_SPEED_STEPS }, 'Speed', [], NOW).speed).toBe(1);
    expect(afterIrSend(EMPTY_IR_REMOTE_STATE, 'Speed', [], NOW).speed).toBe(1);
  });

  it('does not invent a speed when the first press lowers it', () => {
    expect(afterIrSend(EMPTY_IR_REMOTE_STATE, 'Speed down', [], NOW).speed).toBeNull();
    expect(afterIrSend({ ...EMPTY_IR_REMOTE_STATE, speed: 3 }, 'Speed down', [], NOW).speed).toBe(
      2,
    );
    expect(afterIrSend({ ...EMPTY_IR_REMOTE_STATE, speed: 1 }, 'Speed down', [], NOW).speed).toBe(
      1,
    );
  });

  it('flips mute and never counts volume', () => {
    const muted = afterIrSend(EMPTY_IR_REMOTE_STATE, 'Mute', [], NOW);
    expect(muted.muted).toBe(true);
    expect(afterIrSend(muted, 'Mute', [], NOW).muted).toBe(false);
    expect(afterIrSend(EMPTY_IR_REMOTE_STATE, 'Vol up', [], NOW)).toEqual({
      ...EMPTY_IR_REMOTE_STATE,
      sentKey: 'Vol up',
      sentAt: NOW,
      recent: [NOW],
    });
  });

  it('sets the mode from a discrete mode key and cycles the single mode key', () => {
    expect(afterIrSend(EMPTY_IR_REMOTE_STATE, 'heat', ['cool', 'heat'], NOW).mode).toBe('Heat');
    const first = afterIrSend(EMPTY_IR_REMOTE_STATE, 'Mode', [], NOW);
    expect(first.mode).toBe('Cool');
    expect(afterIrSend(first, 'Mode', [], NOW).mode).toBe('Heat');
    expect(afterIrSend({ ...first, mode: 'Auto' }, 'Mode', [], NOW).mode).toBe('Cool');
    expect(afterIrSend({ ...first, mode: 'Sleep' }, 'Mode', [], NOW).mode).toBe('Cool');
  });

  it('keeps the rest of the state when a key has no meaning for it', () => {
    const state = { ...EMPTY_IR_REMOTE_STATE, on: true, temp: 21 };
    const sent = afterIrSend(state, 'Netflix', [], NOW);
    expect(sent.on).toBe(true);
    expect(sent.temp).toBe(21);
  });

  it('keeps the last 24 hours of sends and forgets older ones on the next send', () => {
    const old = '2026-10-17T11:00:00.000Z';
    const inside = '2026-10-17T13:00:00.000Z';
    const state = afterIrSend(
      { ...EMPTY_IR_REMOTE_STATE, recent: [old, inside] },
      'Power',
      [],
      NOW,
    );
    expect(state.recent).toEqual([inside, NOW]);
    expect(irRecentSends([old, NOW], NOW)).toEqual([NOW]);
  });
});

describe('withIrChange', () => {
  it('changes only the named fields, and null clears one', () => {
    const start = { ...EMPTY_IR_REMOTE_STATE, on: true, temp: 22, sentKey: 'Power' };
    expect(withIrChange(start, { on: false })).toEqual({ ...start, on: false });
    expect(withIrChange(start, { temp: null, mode: 'Cool', speed: 2, muted: true })).toEqual({
      ...start,
      temp: null,
      mode: 'Cool',
      speed: 2,
      muted: true,
    });
    expect(withIrChange(start, { checkDeviceId: 'plug' }).checkDeviceId).toBe('plug');
    expect(withIrChange(start, {})).toEqual(start);
  });
});

describe('the stored state and its change', () => {
  it('accepts what the hub stores and refuses values no appliance could have', () => {
    expect(IR_REMOTE_STATE.safeParse(EMPTY_IR_REMOTE_STATE).success).toBe(true);
    expect(IR_REMOTE_STATE.safeParse({ ...EMPTY_IR_REMOTE_STATE, temp: 99 }).success).toBe(false);
    expect(IR_REMOTE_STATE.safeParse({ ...EMPTY_IR_REMOTE_STATE, volume: 3 }).success).toBe(false);
  });

  it('needs at least one field to change and takes no history', () => {
    expect(IR_REMOTE_CHANGE.safeParse({}).success).toBe(false);
    expect(IR_REMOTE_CHANGE.safeParse({ on: null }).success).toBe(true);
    expect(IR_REMOTE_CHANGE.safeParse({ recent: [] }).success).toBe(false);
  });
});
