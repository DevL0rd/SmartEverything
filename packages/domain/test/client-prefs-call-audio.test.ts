import { describe, expect, it } from 'vitest';
import { API_ENDPOINTS, CLIENT_PREFS, DEFAULT_PAUSE_MS, SETTINGS_ROW } from '../src';

const { call_audio: callAudio } = CLIENT_PREFS;

describe('the call audio preference after the pause moved to the home', () => {
  it('no longer stores a pause and refuses one', () => {
    expect('pause_ms' in callAudio.defaultValue).toBe(false);
    expect(callAudio.schema.safeParse({ ...callAudio.defaultValue, pause_ms: 200 }).success).toBe(
      false,
    );
  });

  it('upgrades a saved version 1 value by dropping its pause', () => {
    const saved = { version: 1, value: { ...callAudio.defaultValue, volume: 0.4, pause_ms: 640 } };
    const read = callAudio.decode(saved);
    expect(read).toEqual({
      status: 'stored',
      value: { ...callAudio.defaultValue, volume: 0.4 },
      migrated: true,
    });
  });

  it('reads a version 2 value as saved', () => {
    const read = callAudio.decode(callAudio.encode({ ...callAudio.defaultValue, volume: 0.2 }));
    expect(read).toMatchObject({ status: 'stored', migrated: false });
  });

  it('keeps a version 1 value that is broken beyond the pause invalid', () => {
    expect(callAudio.decode({ version: 1, value: { volume: 9, pause_ms: 200 } }).status).toBe(
      'invalid',
    );
  });
});

describe('the home end-of-speech pause', () => {
  it('lives in the settings row with the default pause', () => {
    expect(SETTINGS_ROW.shape.end_of_speech_pause_ms.parse(undefined)).toBe(DEFAULT_PAUSE_MS);
    expect(SETTINGS_ROW.shape.end_of_speech_pause_ms.safeParse(500).success).toBe(false);
  });

  it('is changed by the owner with one of the choices', () => {
    const { updateListeningSettings } = API_ENDPOINTS;
    expect(updateListeningSettings.access).toBe('owner');
    expect(updateListeningSettings.body.safeParse({ end_of_speech_pause_ms: 1000 }).success).toBe(
      true,
    );
    expect(updateListeningSettings.body.safeParse({ end_of_speech_pause_ms: 7 }).success).toBe(
      false,
    );
    expect(updateListeningSettings.body.safeParse({}).success).toBe(false);
  });
});
