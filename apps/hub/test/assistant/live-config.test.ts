import { describe, expect, it } from 'vitest';
import { liveConfigOf, type LiveOptions } from '../../src/assistant-voice/gemini';

const options: LiveOptions = {
  model: 'gemini-3.8-live',
  voice: 'Puck',
  system: 'be brief',
  tools: [],
  webSearch: true,
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

  it('searches the web beside the function declarations when the chat allows it', () => {
    expect(liveConfigOf(options).tools).toEqual([
      { googleSearch: {} },
      { functionDeclarations: [] },
    ]);
  });

  it('declares no search tool when the chat does not allow web search', () => {
    expect(liveConfigOf({ ...options, webSearch: false }).tools).toEqual([
      { functionDeclarations: [] },
    ]);
  });

  it('keeps the voice and system instruction', () => {
    const config = liveConfigOf(options);
    expect(config.systemInstruction).toBe('be brief');
    expect(config.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName).toBe('Puck');
  });

  it('lets Gemini decide when the person is done, quickly, unless a pause was chosen', () => {
    for (const pauseMs of [undefined, 0]) {
      const detection = liveConfigOf({
        ...options,
        ...(pauseMs === undefined ? {} : { pauseMs }),
      }).realtimeInputConfig?.automaticActivityDetection;
      expect(detection).not.toHaveProperty('silenceDurationMs');
      expect(detection?.endOfSpeechSensitivity).toBe('END_SENSITIVITY_HIGH');
      expect(detection?.disabled).toBe(false);
    }
  });

  it('forces the end of speech only when a pause was chosen', () => {
    const detection = liveConfigOf({ ...options, pauseMs: 1000 }).realtimeInputConfig
      ?.automaticActivityDetection;
    expect(detection?.silenceDurationMs).toBe(1000);
    expect(detection?.endOfSpeechSensitivity).toBe('END_SENSITIVITY_HIGH');
  });
});
