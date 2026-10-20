import { describe, expect, it } from 'vitest';
import {
  VOICE_THINKING_OPTIONS,
  thinkingLevelOf,
  voiceModelIsDefault,
  voiceModelName,
  voiceModelSummary,
} from './voice-model';

describe('voice thinking settings', () => {
  it('offers one picker of four levels with off as the default', () => {
    expect(VOICE_THINKING_OPTIONS.map((option) => option.label)).toEqual([
      'Off (default)',
      'Low',
      'Medium',
      'High',
    ]);
    expect(VOICE_THINKING_OPTIONS[0]?.description).toMatch(/about 3 seconds/);
    expect(VOICE_THINKING_OPTIONS[1]?.description).toMatch(/about 5 seconds/);
    expect(VOICE_THINKING_OPTIONS[3]?.description).toMatch(/about 7 seconds/);
    expect(thinkingLevelOf('high')).toBe('high');
    expect(thinkingLevelOf('minimal')).toBe('off');
  });

  it('summarises the setup in plain words, naming the model the level implies', () => {
    expect(voiceModelSummary({ thinking_level: 'off', voice: 'Puck' })).toBe(
      'Gemini 3.8 Live · No thinking · Puck voice',
    );
    expect(voiceModelSummary({ thinking_level: 'medium', voice: 'Puck' })).toBe(
      'Gemini 3.8 Live Extended Thinking · Medium thinking · Puck voice',
    );
    expect(voiceModelName('custom-live')).toBe('custom-live');
  });

  it('knows when thinking is at its default', () => {
    expect(voiceModelIsDefault({ thinking_level: 'off' })).toBe(true);
    expect(voiceModelIsDefault({ thinking_level: 'low' })).toBe(false);
  });
});
