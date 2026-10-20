import { describe, expect, it } from 'vitest';
import {
  OVERLAY_ACTION,
  VOICE_LEVEL_SHORT_NOTES,
  VOICE_THINKING_COPY,
  VOICE_THINKING_LEVELS,
  chipOf,
  overlayView,
  setupOf,
} from '../src';
import { VOICE, call, input } from './support/voice-overlay-fixtures';

describe('setupOf', () => {
  it('shows the loading state before the hub value is known', () => {
    expect(setupOf(null)).toEqual({
      level: null,
      state: 'loading',
      note: VOICE_THINKING_COPY.loading,
    });
  });

  it('shows the short note of each level when idle', () => {
    for (const level of VOICE_THINKING_LEVELS) {
      expect(setupOf({ ...VOICE, thinking_level: level })).toEqual({
        level,
        state: 'ready',
        note: VOICE_LEVEL_SHORT_NOTES[level],
      });
    }
  });

  it('keeps the level note while saving and shows the reconnect note once saved', () => {
    const saving = setupOf({ ...VOICE, thinking_level: 'high', saving: true, changedInCall: true });
    expect(saving).toEqual({ level: 'high', state: 'saving', note: VOICE_LEVEL_SHORT_NOTES.high });
    const saved = setupOf({ ...VOICE, thinking_level: 'high', changedInCall: true });
    expect(saved).toMatchObject({ state: 'ready', note: VOICE_THINKING_COPY.reconnect });
  });

  it('says the value could not be loaded when a native read failed', () => {
    expect(setupOf({ ...VOICE, thinking_level: null, failed: true })).toEqual({
      level: null,
      state: 'failed',
      note: VOICE_THINKING_COPY.loadFailed,
    });
    expect(chipOf({ ...VOICE, thinking_level: null, failed: true })).toBeNull();
  });

  it('shows the error over everything else', () => {
    expect(setupOf({ ...VOICE, failed: true, changedInCall: true })).toMatchObject({
      state: 'failed',
      note: VOICE_THINKING_COPY.failed,
    });
  });
});

describe('chipOf', () => {
  it('names the level and turns warm only while saving or failed', () => {
    expect(chipOf({ ...VOICE })).toEqual({
      level: 'off',
      label: 'Thinking off',
      description: 'Thinking off. Open thinking settings.',
      warm: false,
    });
    expect(chipOf({ ...VOICE, thinking_level: 'medium' })?.label).toBe('Thinking: Medium');
    expect(chipOf({ ...VOICE, saving: true })?.warm).toBe(true);
    expect(chipOf({ ...VOICE, failed: true })?.warm).toBe(true);
    expect(chipOf(null)).toBeNull();
  });

  it('is part of a live view and absent from a hosted one', () => {
    const live = overlayView(input({ call: call({ phase: 'speaking' }) }));
    expect(live.chip?.label).toBe('Thinking off');
    expect(live.tray?.setup.level).toBe('off');
    const hosted = overlayView(input({ call: call({ phase: 'speaking', hosted: true }) }));
    expect(hosted.chip).toBeNull();
    expect(hosted.tray).toBeNull();
  });
});

describe('the voice_thinking action', () => {
  it('accepts the four levels and nothing else', () => {
    for (const level of VOICE_THINKING_LEVELS) {
      expect(OVERLAY_ACTION.safeParse({ kind: 'voice_thinking', level }).success).toBe(true);
    }
    expect(OVERLAY_ACTION.safeParse({ kind: 'voice_thinking', level: 'max' }).success).toBe(false);
    expect(OVERLAY_ACTION.safeParse({ kind: 'voice_thinking' }).success).toBe(false);
  });
});
