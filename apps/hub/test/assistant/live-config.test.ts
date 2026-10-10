import { describe, expect, it } from 'vitest';
import { liveConfigOf, type LiveOptions } from '../../src/assistant-voice/gemini';

const options: LiveOptions = {
  model: 'gemini-3.8-live',
  voice: 'Puck',
  system: 'be brief',
  tools: [],
  webSearch: false,
  resume: null,
  window: null,
  automatic: true,
};

describe('liveConfigOf', () => {
  it('sends no thinking field, which gemini-3.8-live rejects', () => {
    const config = liveConfigOf(options);
    expect(config).not.toHaveProperty('thinkingConfig');
    expect(JSON.stringify(config)).not.toMatch(/thinking/i);
  });

  it('keeps the voice and system instruction', () => {
    const config = liveConfigOf(options);
    expect(config.systemInstruction).toBe('be brief');
    expect(config.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName).toBe('Puck');
  });
});
