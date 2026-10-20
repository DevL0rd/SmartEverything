import { describe, expect, it } from 'vitest';
import {
  ASSISTANT_SETTINGS,
  ASSISTANT_SETTINGS_CHANGE,
  VOICE_LIVE_MODEL,
  VOICE_THINKING_MODEL,
  voiceModelFor,
  voiceThinkingOf,
} from '../src/index';

describe('voice thinking setting', () => {
  it('defaults to off', () => {
    const voice = ASSISTANT_SETTINGS.parse({}).voice;
    expect(voice.thinking_level).toBe('off');
    expect(voice).not.toHaveProperty('model');
  });

  it('derives the model from the level in one place', () => {
    expect(voiceModelFor('off')).toBe(VOICE_LIVE_MODEL);
    for (const level of ['low', 'medium', 'high'] as const) {
      expect(voiceModelFor(level)).toBe(VOICE_THINKING_MODEL);
    }
  });

  it('maps a stored quick model to off whatever level it carried', () => {
    const voice = ASSISTANT_SETTINGS.parse({
      voice: { model: VOICE_LIVE_MODEL, thinking_level: 'high', idle_seconds: 30 },
    }).voice;
    expect(voice.thinking_level).toBe('off');
    expect(voice.idle_seconds).toBe(30);
    expect(voice).not.toHaveProperty('model');
  });

  it('maps a stored extended model to its level, or low without one', () => {
    const stored = (voice: object): string =>
      ASSISTANT_SETTINGS.parse({ voice }).voice.thinking_level;
    expect(stored({ model: VOICE_THINKING_MODEL })).toBe('low');
    expect(stored({ model: VOICE_THINKING_MODEL, thinking_level: 'high' })).toBe('high');
  });

  it('accepts only the documented levels in a change', () => {
    for (const level of ['off', 'low', 'medium', 'high']) {
      expect(ASSISTANT_SETTINGS_CHANGE.parse({ voice: { thinking_level: level } })).toEqual({
        voice: { thinking_level: level },
      });
    }
    for (const level of ['minimal', 'max', 1]) {
      expect(
        ASSISTANT_SETTINGS_CHANGE.safeParse({ voice: { thinking_level: level } }).success,
      ).toBe(false);
    }
    expect(
      ASSISTANT_SETTINGS_CHANGE.safeParse({ voice: { model: VOICE_LIVE_MODEL } }).success,
    ).toBe(false);
  });

  it('sends a thinking level to Gemini only above off', () => {
    expect(voiceThinkingOf('off')).toBeNull();
    expect(voiceThinkingOf('medium')).toBe('medium');
  });
});
